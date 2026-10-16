// The kit registries (2026-10-15, the perf lane): maps/regional/index.ts STYLE_TABLE and landmarks/index.ts
// LANDMARK_TABLE hold every architecture style and every set-piece builder as one row each; the browser loads a map's
// kits when its world build starts (worldKits.ts loadMapKits from map.ts createMapAsync), Node loads every kit at once.
// 1. The table law: every row's module path is its loader's own import, every exported style and every planned kind
//    has its row, and no module but a registry loads a kit lazily.
// 2. Node: every kit loaded, in the order the static imports gave (ARCHITECTURE_STYLES, LANDMARK_BUILDERS' keys).
// 3. The browser's way (a child under COT_KITS_LAZY=1): nothing loaded until asked, a table kit read before it loads
//    fails closed with its name, an unknown one as before; loadMapKits loads exactly a map's kits and its build reads.
// The whole proof that every map builds the same records from its own kits is the drift receipt run the browser's way:
// COT_KITS_LAZY=1 node server/collisionManifestDrift.selftest.mjs (the 10-15 run: every map current).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (path) => new URL(path, import.meta.url);
const regionalSource = readFileSync(here('./maps/regional/index.ts'), 'utf8');
const landmarkSource = readFileSync(here('./landmarks/index.ts'), 'utf8');

// ---- 1. the table law
const rowsOf = (source, start) => {
  const from = source.indexOf(start);
  assert.ok(from > 0, `the table ${start}`);
  const body = source.slice(from, source.indexOf('\n});', from));
  return [...body.matchAll(/^ {2}([a-zA-Z]+): \{ file: '([^']+)',(?: name: '([A-Z_]+)',)? load: \(\) => import\('([^']+)'\)/gm)]
    .map(([, id, file, name, loaded]) => ({ id, file, name, loaded }));
};
const styleRows = rowsOf(regionalSource, 'const STYLE_TABLE');
const landmarkRows = rowsOf(landmarkSource, 'const LANDMARK_TABLE');
for (const row of [...styleRows, ...landmarkRows]) assert.equal(row.loaded, row.file, `${row.id}: its module path is its loader's import`);
// every style a kit module exports has its row (a new kit file is one row), and only those
const regionalDir = fileURLToPath(here('./maps/regional/'));
const exported = [];
for (const file of readdirSync(regionalDir).filter((name) => name.endsWith('.ts') && name !== 'index.ts')) {
  for (const m of readFileSync(regionalDir + file, 'utf8').matchAll(/^export const ([A-Z]+_STYLE)\b/gm)) exported.push(`./${file}:${m[1]}`);
}
assert.deepEqual(styleRows.map((row) => `${row.file}:${row.name}`).sort(), exported.sort(), 'every exported style is a row of STYLE_TABLE');
// no module but the registries loads a kit lazily (one table: a second loader would be a second registry)
const kitModules = new Set([...styleRows, ...landmarkRows].map((row) => row.file.slice(2)));
const srcDir = fileURLToPath(here('../'));
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  (entry.isDirectory() ? walk(`${dir}${entry.name}/`) : entry.name.endsWith('.ts') ? [`${dir}${entry.name}`] : []));
const strays = [];
for (const file of walk(srcDir)) {
  if (file.endsWith('/world/maps/regional/index.ts') || file.endsWith('/world/landmarks/index.ts')) continue;
  const inKitDir = /\/world\/(maps\/regional|landmarks)\/[^/]+$/.test(file);
  for (const m of readFileSync(file, 'utf8').matchAll(/import\(\s*'([^']+)'\s*\)/g)) {
    const target = m[1].split('/').pop();
    if (kitModules.has(target) && (inKitDir || /maps\/regional\/|landmarks\//.test(m[1]))) strays.push(`${file.slice(srcDir.length)}: ${m[1]}`);
  }
}
assert.deepEqual(strays, [], 'only the registries load a kit module on demand');

// ---- 2. Node: every kit, in the static imports' order
const regional = await import('./maps/regional/index.ts');
const landmarks = await import('./landmarks/index.ts');
const { LANDMARK_KINDS } = await import('./landmarks/plan.ts');
assert.deepEqual([...regional.ARCHITECTURE_STYLE_IDS], styleRows.map((row) => row.id), 'the ids in the table\'s order');
assert.deepEqual(regional.ARCHITECTURE_STYLES.map((style) => style.id), styleRows.map((row) => row.id), 'Node holds every style, in the table\'s order');
for (const id of regional.ARCHITECTURE_STYLE_IDS) assert.equal(regional.resolveRegionalArchitecture(id).id, id);
assert.throws(() => regional.resolveRegionalArchitecture('atlantis'), /Unknown architecture style atlantis/, 'an unknown style fails closed');
assert.equal(regional.resolveRegionalArchitecture(null), null);
assert.deepEqual(Object.keys(landmarks.LANDMARK_BUILDERS), landmarkRows.map((row) => row.id), 'Node holds every builder, in the table\'s order');
assert.deepEqual(landmarkRows.map((row) => row.id).sort(), Object.keys(LANDMARK_KINDS).sort(), 'every planned kind is a row');
for (const row of landmarkRows) assert.equal(typeof landmarks.LANDMARK_BUILDERS[row.id], 'function', `${row.id} is built by its module's export`);
assert.equal(landmarks.LANDMARK_BUILDERS.atlantis, undefined, 'a kind outside the table reads undefined (compose.ts skips it)');
assert.throws(() => { landmarks.LANDMARK_BUILDERS.church = null; }, TypeError, 'the builders stay read-only');
// what a map's set pieces need: their kinds, their children's, compose's paths, and their builders' styles
assert.deepEqual(landmarks.landmarkKitsOf([]), { kinds: [], styles: [] });
assert.deepEqual(landmarks.landmarkKitsOf([
  { kind: 'parkSquare', x: 0, z: 0, params: { centre: 'obelisk' } }, { kind: 'parkSquare', x: 9, z: 0 },
  { kind: 'houseRow', x: 0, z: 0 }, { kind: 'houseRow', x: 0, z: 9, params: { kit: 'hessian' } }, { kind: 'atlantis', x: 0, z: 0 },
]), { kinds: ['parkSquare', 'houseRow', 'path', 'obelisk'], styles: ['dalmatian', 'hessian'] },
'a square\'s centre piece, a house row\'s kit (its default the plan\'s), compose\'s paths; an unknown kind left to compose');

// ---- 3. the browser's way
const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  const regional = await import(${JSON.stringify(here('./maps/regional/index.ts').href)});
  const landmarks = await import(${JSON.stringify(here('./landmarks/index.ts').href)});
  const { loadMapKits, mapKitsOf } = await import(${JSON.stringify(here('./worldKits.ts').href)});
  const { worldBuildConfig } = await import(${JSON.stringify(here('./worldBuildConfig.ts').href)});
  const { MAP_IDS } = await import(${JSON.stringify(here('./maps/mapIds.ts').href)});
  assert.equal(regional.ARCHITECTURE_STYLES.length, 0, 'nothing loaded before a world build asks');
  assert.equal(Object.keys(landmarks.LANDMARK_BUILDERS).length, 0);
  assert.throws(() => regional.resolveRegionalArchitecture('hessian'), /hessian is not loaded/, 'a table style read early fails closed');
  assert.throws(() => regional.resolveRegionalArchitecture('atlantis'), /Unknown architecture style/);
  assert.throws(() => landmarks.LANDMARK_BUILDERS.church, /church is not loaded/, 'a table kind read early fails closed');
  assert.equal(landmarks.LANDMARK_BUILDERS.atlantis, undefined);
  const plans = {};
  for (const id of MAP_IDS) plans[id] = mapKitsOf(worldBuildConfig(id));
  const pick = MAP_IDS.find((id) => plans[id].styles.length && plans[id].landmarks.length);
  assert.ok(pick, 'a map with a kit and set pieces');
  await loadMapKits(worldBuildConfig(pick));
  assert.deepEqual(regional.ARCHITECTURE_STYLES.map((s) => s.id).sort(), [...plans[pick].styles].sort(), 'exactly the map\\'s styles');
  assert.deepEqual(Object.keys(landmarks.LANDMARK_BUILDERS).sort(), [...new Set(plans[pick].landmarks)].sort(), 'exactly its set pieces');
  for (const id of plans[pick].styles) assert.equal(regional.resolveRegionalArchitecture(id).id, id);
  await loadMapKits(worldBuildConfig(pick));
  assert.equal(regional.ARCHITECTURE_STYLES.length, plans[pick].styles.length, 'a second build loads nothing twice');
  const all = new Set(), kinds = new Set();
  for (const id of MAP_IDS) { for (const s of plans[id].styles) all.add(s); for (const k of plans[id].landmarks) kinds.add(k); }
  console.log(JSON.stringify({ pick, styles: plans[pick].styles, landmarks: plans[pick].landmarks.length, mapsStyles: all.size, mapsKinds: kinds.size }));
`], { env: { ...process.env, COT_KITS_LAZY: '1' }, encoding: 'utf8', timeout: 600000 });
assert.equal(child.status, 0, `the browser's way: ${(child.stderr || '').split('\n').filter((line) => !/Warning|trace-warnings/.test(line)).slice(-8).join(' | ')}`);
const lazy = JSON.parse(child.stdout.trim().split('\n').pop());

console.log(`kitRegistry.selftest: ${styleRows.length} styles and ${landmarkRows.length} set pieces, one row each; Node holds every kit in the static order; the browser's way loads ${lazy.pick}'s ${lazy.styles.join(', ')} and its ${lazy.landmarks} set pieces only (every map together reads ${lazy.mapsStyles} styles and ${lazy.mapsKinds} kinds)`);
