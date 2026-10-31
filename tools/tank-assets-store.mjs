// tank-assets-store.mjs — the tank asset manifest, one file per tank (266). First-party tooling: Kevin B. Liu.
//
// genIcons writes, and the asset tools read, the record that binds every tank's generated views to its live geometry
// and gameplay data. Until 266 it was one file, public/icons/tank-assets.json: 51.5 MB at 236 tanks, past GitHub's
// 50 MB warning, growing toward its 100 MB push limit, and edited by every tank lane. It is now a directory beside the
// icons it describes:
//
//   <icons>/tank-assets/index.json        the header: schemaVersion, partial, generator, requiredViews (no id list,
//                                         so adding a tank never touches it)
//   <icons>/tank-assets/tanks/<id>.json   one tank's row; the file name is the row's id
//
// readTankAssets() returns the old monolith's shape in its order ({ ...header, tanks }, ids by compareTankIds), so
// tankAssetsMonolithText(readTankAssets(dir)) is the old file byte for byte. Every writer goes through
// writeTankAssets(), which writes each file in its canonical text (serializeTankAssetJson) and only when that text
// changed. tankAssetsLayoutProblems() is the layout's check (tools/tank-assets-layout.selftest.mjs and the release gate,
// tools/tank-assets-check.mjs, both run it): the size cap, the canonical texts, file names, and no stray or legacy file.
// No page requests any of it: the build drops the directory (tools/tool-only-public-files.mjs). The module names no
// repository path itself (the caller passes the icons directory), so the changed-only keys of the steps that import it
// (icons, centering) never read the rows through it (tools/changed-only/steps.mjs DECLARED_DYNAMIC).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** No generated manifest file may be larger (tools/tank-assets-layout.selftest.mjs); GitHub warns at 50 MB. */
export const TANK_ASSET_FILE_CAP_BYTES = 5 * 1024 * 1024;
const INDEX_FILE = 'index.json';
const ROWS_DIR = 'tanks';
const TANK_ID = /^[a-z0-9_]+$/;
const ROW_FILE = /^tanks\/([a-z0-9_]+)\.json$/;

/** A character's place in the id order: '_' before the digits before the letters. */
const idRank = (code) => (code === 95 ? 0 : code <= 57 ? code - 47 : code - 86);
/**
 * The one order of manifest ids, for writing and reassembly alike: character by character with '_' before digits
 * before letters, a prefix first. It is the order localeCompare gave under ICU's root collation, which wrote every
 * manifest before 266 (challenger_x before challenger1_mk1, unlike code-point order), pinned so no locale can move it.
 */
export function compareTankIds(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const delta = idRank(a.charCodeAt(i)) - idRank(b.charCodeAt(i));
    if (delta) return delta;
  }
  return a.length - b.length;
}

export const tankAssetsDir = (iconsDir) => join(iconsDir, 'tank-assets');
export const tankAssetIndexPath = (iconsDir) => join(tankAssetsDir(iconsDir), INDEX_FILE);
export const tankAssetRowsDir = (iconsDir) => join(tankAssetsDir(iconsDir), ROWS_DIR);
export function tankAssetRowPath(iconsDir, id) {
  if (!TANK_ID.test(id)) throw new Error(`tank-assets: '${id}' is not a tank id`);
  return join(tankAssetRowsDir(iconsDir), `${id}.json`);
}

function canonical(value, indent) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    if (value.every((item) => item === null || typeof item !== 'object')) return JSON.stringify(value);
    return `[\n${value.map((item) => inner + canonical(item, inner)).join(',\n')}\n${indent}]`;
  }
  const keys = Object.keys(value).filter((key) => value[key] !== undefined && typeof value[key] !== 'function');
  if (!keys.length) return '{}';
  return `{\n${keys.map((key) => `${inner}${JSON.stringify(key)}: ${canonical(value[key], inner)}`).join(',\n')}\n${indent}}`;
}

/** A manifest file's canonical text: two-space JSON with each array of plain values on one line (a plate vertex is
 *  one line, not five) and a final newline. Parsing it gives back the same value. */
export const serializeTankAssetJson = (value) => `${canonical(value, '')}\n`;

/** The pre-266 single file's text for a manifest ({ ...header, tanks }): the split's byte-exact reassembly. */
export const tankAssetsMonolithText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

/** The ids that have a row file, in compareTankIds order. */
export function tankAssetIds(iconsDir) {
  let names;
  try {
    names = readdirSync(tankAssetRowsDir(iconsDir));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return names.filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -'.json'.length)).sort(compareTankIds);
}

/** One tank's row, or null when it has none. */
export function readTankAssetRow(iconsDir, id) {
  const path = tankAssetRowPath(iconsDir, id);
  if (!existsSync(path)) return null;
  const row = JSON.parse(readFileSync(path, 'utf8'));
  if (row?.id !== id) throw new Error(`tank-assets: ${path} holds the row of '${row?.id}'`);
  return row;
}

/** The whole manifest in the old monolith's shape and order, or null when there is no index. */
export function readTankAssets(iconsDir) {
  const indexPath = tankAssetIndexPath(iconsDir);
  if (!existsSync(indexPath)) return null;
  const header = JSON.parse(readFileSync(indexPath, 'utf8'));
  const tanks = {};
  for (const id of tankAssetIds(iconsDir)) tanks[id] = readTankAssetRow(iconsDir, id);
  return { ...header, tanks };
}

/** What is wrong with a manifest directory: [] when every file is the index or a tanks/<id>.json row holding <id>, in
 *  its canonical text, at most capBytes, and the pre-266 single file is gone. */
export function tankAssetsLayoutProblems(iconsDir, { capBytes = TANK_ASSET_FILE_CAP_BYTES } = {}) {
  const problems = [];
  const dir = tankAssetsDir(iconsDir);
  if (existsSync(join(iconsDir, 'tank-assets.json'))) {
    problems.push('tank-assets.json: the pre-266 single file is back; re-home its rows with tools/tank-assets-split.mjs and delete it');
  }
  if (!existsSync(tankAssetIndexPath(iconsDir))) return [...problems, `tank-assets/${INDEX_FILE} is missing`];
  const walk = (rel) => readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((entry) => {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    return entry.isDirectory() ? walk(path) : [path];
  });
  for (const rel of walk('').sort()) {
    const name = `tank-assets/${rel}`;
    const row = ROW_FILE.exec(rel);
    if (rel !== INDEX_FILE && !row) { problems.push(`${name}: not part of the manifest (${INDEX_FILE} and ${ROWS_DIR}/<id>.json only)`); continue; }
    const bytes = readFileSync(join(dir, rel));
    if (bytes.length > capBytes) {
      problems.push(`${name}: ${(bytes.length / 1048576).toFixed(2)} MB, over the ${(capBytes / 1048576).toFixed(2)} MB cap`);
    }
    const text = bytes.toString('utf8');
    let value;
    try { value = JSON.parse(text); } catch { problems.push(`${name}: not JSON`); continue; }
    if (serializeTankAssetJson(value) !== text) problems.push(`${name}: not in its canonical text (write it with writeTankAssets)`);
    if (row && value?.id !== row[1]) problems.push(`${name}: holds the row of '${value?.id}'`);
    if (!row && Object.hasOwn(value ?? {}, 'tanks')) problems.push(`${name}: the index holds rows`);
  }
  return problems;
}

/**
 * Write a manifest ({ ...header, tanks }) as its files, each only when its canonical text changed. `prune` (a whole
 * fleet write) also removes the row files of tanks the manifest no longer holds; without it a selective write leaves
 * the rows it does not name as they are. `dryRun` writes nothing. Returns the paths that differ and the ids removed.
 */
export function writeTankAssets(iconsDir, manifest, { prune = false, dryRun = false } = {}) {
  const { tanks = {}, ...header } = manifest;
  const changed = [], removed = [];
  const put = (path, value) => {
    const text = serializeTankAssetJson(value);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) return;
    changed.push(path);
    if (!dryRun) writeFileSync(path, text);
  };
  if (!dryRun) mkdirSync(tankAssetRowsDir(iconsDir), { recursive: true });
  put(tankAssetIndexPath(iconsDir), header);
  for (const id of Object.keys(tanks).sort(compareTankIds)) {
    if (tanks[id]?.id !== id) throw new Error(`tank-assets: the row keyed '${id}' carries id '${tanks[id]?.id}'`);
    put(tankAssetRowPath(iconsDir, id), tanks[id]);
  }
  if (prune) {
    for (const id of tankAssetIds(iconsDir)) {
      if (Object.hasOwn(tanks, id)) continue;
      removed.push(id);
      if (!dryRun) rmSync(tankAssetRowPath(iconsDir, id));
    }
  }
  return { changed, removed };
}
