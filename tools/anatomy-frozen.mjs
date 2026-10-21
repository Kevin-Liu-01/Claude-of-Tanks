#!/usr/bin/env node
// anatomy-frozen.mjs — the combat-data byte-identity guard of the Gallery anatomy lane (BUI-G2..G4, H8).
//
// The anatomy presentation (src/vehicles/anatomyCore) draws its models FROM the combat volumes; it never writes them.
// This tool pins that promise: the sha256 of every frozen source path (the sim, the combat-anatomy generators and
// shards, the interior fills, the internal layout registry, the spec registry and its helpers, every vehicle
// profile, and the legacy diagram renderer kept for the baked PNGs until BUI-G8) plus a canonical-JSON hash of
// getSpec(id).armor for every registered vehicle, taken at the lane's reviewed base (manifest `base`).
//
//   ANATOMY_FROZEN_BASE=<sha> node tools/anatomy-frozen.mjs --write   rewrite the manifest (only at a reviewed base)
//   node tools/anatomy-frozen.mjs --check    exit 1 on any drift (tools/anatomy-frozen-check.mjs asserts the same)
//
// Copyright (c) 2026 Kevin B. Liu. First-party tool; see NOTICE.md.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'tools/anatomy-frozen.manifest.json');

/** Frozen roots: a directory is taken recursively, a file as itself; `match` filters a directory's files. */
export const FROZEN_ROOTS = Object.freeze([
  { path: 'src/sim' },
  { path: 'src/vehicles', match: /^combatAnatomy[^/]*\.ts$/ },
  { path: 'src/vehicles/combatAnatomyGroups' },
  { path: 'src/vehicles/interiorFills.ts' },
  { path: 'src/vehicles/interiorFillGroups' },
  { path: 'src/vehicles/interiorFillLoaders.generated.ts' },
  { path: 'src/vehicles/internalLayoutRegistry.ts' },
  { path: 'src/vehicles/specs.ts' },
  { path: 'src/vehicles/specHelpers.ts' },
  { path: 'src/vehicles/specContracts.ts' },
  { path: 'src/vehicles/profiles' },
  { path: 'src/gallery/overlays.ts' },
  { path: 'src/vehicles/internalAnatomyVisuals.ts' },
]);

function walk(path, match, out) {
  const absolute = join(ROOT, path);
  const stat = statSync(absolute);
  if (stat.isFile()) { out.push(path); return; }
  for (const name of readdirSync(absolute).sort()) {
    const child = join(path, name);
    const childStat = statSync(join(ROOT, child));
    if (childStat.isDirectory()) { if (!match) walk(child, match, out); continue; }
    if (!match || match.test(name)) out.push(child);
  }
}

export function frozenFiles() {
  const files = [];
  for (const root of FROZEN_ROOTS) walk(root.path, root.match, files);
  return [...new Set(files.map((file) => relative(ROOT, join(ROOT, file)).split('\\').join('/')))].sort();
}

export function fileHashes() {
  const hashes = {};
  for (const file of frozenFiles()) hashes[file] = createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
  return hashes;
}

/** Canonical JSON: sorted keys, runtime caches (keys starting with '_') left out, non-finite numbers spelled. */
export function canonicalJson(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `"${value}"`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'function') return 'null';
  if (ArrayBuffer.isView(value)) return `[${Array.from(value, (entry) => canonicalJson(entry)).join(',')}]`;
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const keys = Object.keys(value).filter((key) => !key.startsWith('_') && value[key] !== undefined && typeof value[key] !== 'function').sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export async function armorHashes(ids = null) {
  await import(pathToFileURL(join(ROOT, 'src/vehicles/tankFactory.ts')).href);
  const { ALL_TANK_IDS, getSpec } = await import(pathToFileURL(join(ROOT, 'src/vehicles/specs.ts')).href);
  const hashes = {};
  for (const id of ids || [...ALL_TANK_IDS].sort()) {
    hashes[id] = createHash('sha256').update(canonicalJson(getSpec(id).armor)).digest('hex');
  }
  return hashes;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const write = process.argv.includes('--write');
  const files = fileHashes();
  const armor = await armorHashes();
  if (write) {
    writeFileSync(MANIFEST, `${JSON.stringify({
      note: 'Combat-data byte identity for the Gallery anatomy lane: sha256 of every frozen path and a canonical-JSON hash of getSpec(id).armor per vehicle. Rewrite only at a reviewed base (tools/anatomy-frozen.mjs --write).',
      base: process.env.ANATOMY_FROZEN_BASE || 'unknown',
      files, armor,
    }, null, 1)}\n`);
    console.log(`anatomy-frozen: wrote ${Object.keys(files).length} files, ${Object.keys(armor).length} armor hashes`);
  } else {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const drift = [];
    for (const [file, hash] of Object.entries(manifest.files)) if (files[file] !== hash) drift.push(`file ${file}`);
    for (const file of Object.keys(files)) if (!(file in manifest.files)) drift.push(`new frozen file ${file}`);
    for (const [id, hash] of Object.entries(manifest.armor)) if (armor[id] !== hash) drift.push(`armor ${id}`);
    for (const id of Object.keys(armor)) if (!(id in manifest.armor)) drift.push(`new armor ${id}`);
    if (drift.length) {
      console.error(`anatomy-frozen: ${drift.length} drift(s) against ${manifest.base}:\n  ${drift.slice(0, 40).join('\n  ')}`);
      process.exit(1);
    }
    console.log(`anatomy-frozen: ${Object.keys(files).length} frozen files and ${Object.keys(armor).length} armor hashes match ${manifest.base} PASS`);
  }
}
