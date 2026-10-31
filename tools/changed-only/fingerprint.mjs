// Changed-only fingerprints: which (step, tank id) pairs must be regenerated. First-party tooling: Kevin B. Liu.
//
// Every (step, id) has an input key and an output key, recorded in release/fingerprints.tsv when the step last ran:
//   inKey(step, id)  = H(schema, toolchain, tool(step), builderKey(id), rowsKey(step, id))
//   outKey(step, id) = H(the id's rows in every table the step writes)
//   tool(step)       = the tool's static closure stopped at the fleet (core and per-id tables), its declared dynamic
//                      reads, the environment variables any closure file reads (with values) and the step definition
//                      (canonical flags included)
//   builderKey(id)   = H(core, roster, group(g) for every fleet group on the id's spec chain)
//   core             = every file the fleet entry modules reach without going through a group's builder registration
//                      (specs, the factory, kits, materials, generated spec data, the index/loader maps)
//   group(g)         = the files fleetFactory GROUP_LOADERS[g] reaches beyond the core
//   rowsKey          = the rows of every per-id table the fleet reaches, for every id on the spec chain, minus the
//                      step's own rows of this id
// An id is changed when its row is missing, its inKey moved or its outKey moved (an output edited outside the chain).
// Anything the graph cannot see fails closed: an undeclared dynamic read or a computed import makes the step run on
// every id; a roster change, a missing manifest or a frame edit of an output file runs the step on the whole fleet.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript-compiler-api';
import { accessorPin, createGraph, h16, sha256 } from './graph.mjs';
import { AGGREGATES, DECLARED_DYNAMIC, FLEET_API_TOKENS, FLEET_API_USERS, FLEET_ENTRIES, GROUP_LOADERS_FILE, LOADER_FILES,
  MAP_REGISTRY_FILE, PER_ID_ACCESSORS, SCHEDULING_ENV, STEPS, TABLES, WORLD_OUTPUTS, WORLD_STEPS, stepDefinition } from './steps.mjs';
import { expandGlobs, declaredNotInput } from './globs.mjs';
import { computeWorldState } from './world.mjs';

export const SCHEMA = 1;
// A receipt a fleet record only names (docs/references/concepts/*.json lists its receipts) is no build input either: no
// fleet module runs a receipt or reads a file (266: five such receipts sat in the core key, so an edit to one marked
// every id). One a fleet module imports is still executed, and keyed.
const MENTION_ONLY_DATA = /(?:\.(?:md|txt|pdf|glb|gltf|obj|fbx|blend|png|jpe?g|webp|svg)$)|^public\/models\/|\.selftest\.mjs$/;
export const MANIFEST_PATH = 'release/fingerprints.tsv';
const H = (...parts) => h16(parts.join('\n'));

/** GROUP_LOADERS in fleetFactory.ts: group -> the literal modules its loader imports. Throws on anything else. */
export function parseGroupLoaders(text, filename = GROUP_LOADERS_FILE) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let object = null;
  const find = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'GROUP_LOADERS') {
      const dig = (expr) => {
        if (!expr) return null;
        if (ts.isObjectLiteralExpression(expr)) return expr;
        if (ts.isCallExpression(expr)) return dig(expr.arguments[0]);
        if (ts.isSatisfiesExpression?.(expr) || ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr)) return dig(expr.expression);
        return null;
      };
      object = dig(node.initializer);
    }
    ts.forEachChild(node, find);
  };
  find(source);
  if (!object) throw new Error(`${filename}: GROUP_LOADERS object not found`);
  const groups = {};
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error(`${filename}: GROUP_LOADERS entry is not a plain property`);
    const name = property.name.getText(source).replace(/^['"]|['"]$/g, '');
    const modules = [];
    const visit = (node) => {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (!arg || !ts.isStringLiteralLike(arg)) throw new Error(`${filename}: GROUP_LOADERS.${name} has a computed import`);
        modules.push(arg.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(property.initializer);
    if (!modules.length) throw new Error(`${filename}: GROUP_LOADERS.${name} imports no module`);
    groups[name] = modules;
  }
  return groups;
}

function readRows(root, env, tableModule = null) {
  const out = execFileSync(process.execPath, ['--max-old-space-size=4096', join(import.meta.dirname, 'rows-child.mjs'), root,
    ...(tableModule ? [tableModule] : [])], {
    // 2026-10-20: 30 minutes (was 5): at load average ~500 the rows read after a finished seats step overran 5 minutes
    // and failed the chain with ETIMEDOUT though the step's outputs were written; the traces allow 30-60 minutes
    cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 1_800_000,
    env: { ...env, NODE_OPTIONS: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(out);
}

/** NODE_OPTIONS minus heap-size flags and the self-test runner's preloads (the assert guard decides only failing asserts
 *  in receipts, the observer only records reads; tools/run-selftests.mjs SELFTEST_GRAPH_GUARD, SELFTEST_OBSERVER), none
 *  of which can change what a tool writes. */
export function normalizedNodeOptions(value = '') {
  return value.split(/\s+/).filter((flag) => flag && !/^--max-old-space-size(=|$)/.test(flag)
    && !/^--import=\S*\/tools\/(?:assert-graph-guard|selftest-observe)\.mjs$/.test(flag)).sort().join(' ');
}

/**
 * The fingerprint state of a tree: the fleet partition, the roster, every row, and per step either a decomposed tool key
 * or a fail-closed reason. `rows` may be injected (tests); otherwise one child process reads them.
 */
export const DEFAULT_CONFIG = Object.freeze({
  tables: TABLES, aggregates: AGGREGATES, fleetEntries: FLEET_ENTRIES, loaderFiles: LOADER_FILES,
  groupLoadersFile: GROUP_LOADERS_FILE, declared: DECLARED_DYNAMIC, accessors: PER_ID_ACCESSORS,
  world: Object.freeze({ registryFile: MAP_REGISTRY_FILE, outputs: WORLD_OUTPUTS, fleetApiUsers: FLEET_API_USERS,
    fleetApiTokens: FLEET_API_TOKENS }),
});

export function computeState({ root, steps = STEPS, worldSteps = WORLD_STEPS, env = process.env, rows = null, graph = null, cacheDir,
  config = DEFAULT_CONFIG, tableModule = null, toolchainOverride = null } = {}) {
  root = resolve(root);
  const { tables: TABLES, aggregates: AGGREGATES, fleetEntries: FLEET_ENTRIES, loaderFiles: LOADER_FILES,
    groupLoadersFile: GROUP_LOADERS_FILE, declared: DECLARED_DYNAMIC, accessors: ACCESSORS } = { ...DEFAULT_CONFIG, ...config };
  const declaredHelpers = Object.fromEntries(Object.entries(DECLARED_DYNAMIC)
    .filter(([, declaration]) => declaration.importHelper).map(([file, declaration]) => [file, declaration.importHelper]));
  graph ??= createGraph({ root, importHelpers: declaredHelpers, ...(cacheDir ? { cacheDir } : {}) });
  const abs = (rel) => resolve(root, rel), rel = (path) => relative(root, path);
  const data = rows ?? readRows(root, env, tableModule);
  const globalReasons = data.errors.map((error) => `rows: ${error}`);
  // Every generator iterates one of these id lists; an id outside the keyed list would never be checked.
  const universe = (list) => JSON.stringify([...new Set(list)].sort());
  if (universe(data.roster.all) !== universe(data.roster.saved) || universe(data.roster.all) !== universe(Object.keys(data.roster.groupById))) {
    globalReasons.push('roster: ALL_TANK_IDS, SAVED_TANK_IDS and the fleet manifest name different ids');
  }

  // Toolchain: what runs every tool. A change runs every step on every id.
  const lockHash = (file) => graph.hashFile(abs(file));
  const toolchainParts = [`schema:${SCHEMA}`, `node:${process.version}`, `platform:${process.platform}/${process.arch}`,
    `package-lock:${lockHash('package-lock.json')}`, `installed:${lockHash('node_modules/.package-lock.json')}`,
    `node-options:${normalizedNodeOptions(env.NODE_OPTIONS)}`];
  // toolchainOverride (the freshness receipt only): judge the tree as though it ran on the manifest's toolchain, so a
  // Node or lockfile change on this machine is reported apart instead of marking every id.
  const toolchain = toolchainOverride ?? H(...toolchainParts);

  // Roster: ids, their order, groups, renames. A change runs every step in whole-fleet mode.
  const roster = H(JSON.stringify(data.roster));

  // Tables and aggregates.
  const tableFiles = new Map(); // abs file -> table names
  for (const [name, table] of Object.entries(TABLES)) {
    for (const file of expandGlobs(root, table.files)) {
      if (!tableFiles.has(abs(file))) tableFiles.set(abs(file), new Set());
      tableFiles.get(abs(file)).add(name);
    }
  }
  const aggregateFiles = new Set(AGGREGATES.map(abs));
  const tableStop = new Set([...tableFiles.keys(), ...aggregateFiles]);

  // Fleet partition.
  let groupEntries = {};
  try { groupEntries = parseGroupLoaders(readFileSync(abs(GROUP_LOADERS_FILE), 'utf8')); }
  catch (error) { globalReasons.push(`group loaders: ${error.message}`); }
  const groupEntryFiles = new Map(Object.entries(groupEntries).map(([group, modules]) =>
    [group, modules.map((module) => resolve(dirname(abs(GROUP_LOADERS_FILE)), module))]));
  const allGroupEntries = new Set([...groupEntryFiles.values()].flat());
  const loaderFiles = new Set(LOADER_FILES.map(abs));
  const coreClosure = graph.closure(FLEET_ENTRIES, {
    stop: tableStop,
    skip: (from, to) => loaderFiles.has(from) && allGroupEntries.has(to),
  });
  // A file only named (never imported) by fleet code is hashed as an input, except data no fleet module can read:
  // fleet sources run in Node tools without file access (checked below) and the playable fleet never loads a source
  // model (AGENTS.md: "Source GLBs are comparison/authoring inputs, never a playable loading path").
  const executed = new Set(coreClosure.expanded);
  const fleetData = (file, closure) => !closure.expanded.has(file) && !graph.isDir(file) && MENTION_ONLY_DATA.test(rel(file));
  const coreSet = new Set([...coreClosure.files].filter((file) => !tableFiles.has(file) && !fleetData(file, coreClosure)));
  const reachedTables = new Set();
  const reach = (stopped) => {
    for (const file of stopped) {
      for (const name of tableFiles.get(file) ?? []) reachedTables.add(name);
      // An index or loader map reaches every shard it imports.
      if (aggregateFiles.has(file)) for (const target of graph.edges(file).exec) for (const name of tableFiles.get(target) ?? []) reachedTables.add(name);
    }
  };
  reach(coreClosure.stopped);
  const groupFiles = {};
  for (const [group, entries] of groupEntryFiles) {
    const closure = graph.closure(entries.map(rel), { stop: new Set([...coreSet, ...tableStop]) });
    for (const file of closure.expanded) executed.add(file);
    groupFiles[group] = new Set([...closure.files].filter((file) => !coreSet.has(file) && !tableStop.has(file) && !fleetData(file, closure)));
    reach(closure.stopped);
  }
  const buildReadTables = [...reachedTables].sort();

  // Dynamic reads: declared and pinned, or fail closed.
  const dynamicProblem = (file) => {
    const { flags } = graph.edges(file);
    const dynamic = flags.broad || flags.opaqueImport || flags.opaqueEnvironment || flags.unresolved || flags.git
      || flags.browser || flags.helperComputed.length || flags.sites.length;
    if (!dynamic) return null;
    const declaration = DECLARED_DYNAMIC[rel(file)];
    if (!declaration) return `undeclared dynamic read in ${rel(file)}`;
    if (flags.helperComputed.length) return `computed ${declaration.importHelper}() call in ${rel(file)}`;
    const pin = h16(flags.sites.join('\n'));
    if (pin !== declaration.pin) return `declaration pin stale for ${rel(file)} (now ${pin})`;
    return null;
  };
  const environmentOf = (files) => [...new Set([...files].flatMap((file) => graph.edges(file).flags.environment))].sort();
  const envRows = (names) => names.filter((name) => !Object.hasOwn(SCHEDULING_ENV, name)).map((name) => `env:${name}=${env[name] ?? '<unset>'}`);

  for (const file of executed) {
    const problem = dynamicProblem(file);
    if (problem) globalReasons.push(`fleet: ${problem}`);
    // The mention rule above holds only while no executed fleet module can read a file.
    if (graph.edges(file).flags.fileAccess) {
      globalReasons.push(`fleet: ${rel(file)} can read files`);
    }
  }
  const executedOf = (files) => [...files].filter((file) => executed.has(file));
  const core = H(...graph.rowsOf(coreSet), ...envRows(environmentOf(executedOf(coreSet))),
    ...[...aggregateFiles].map((file) => `agg:${rel(file)}:${graph.hashFile(file)}`));
  const groups = Object.fromEntries(Object.entries(groupFiles).map(([group, files]) =>
    [group, H(...graph.rowsOf(files), ...envRows(environmentOf(executedOf(files))))]));

  // Per-step tool keys.
  const stepStates = {};
  for (const step of steps) {
    const reasons = [...globalReasons];
    const ownTables = new Set(step.outputs);
    // What the step writes: its tables' files, files written whole, and `writes` globs (the icon images beside the
    // manifest). None of it is an input of the step's own key.
    const recorded = new Set([...step.files.map(abs),
      ...[...tableFiles].filter(([, names]) => [...names].some((name) => ownTables.has(name))).map(([file]) => file)]);
    const ownFiles = new Set([...recorded, ...expandGlobs(root, step.writes ?? []).map(abs)]);
    const entries = [step.tool, ...(step.entries ?? [])];
    // A declaration may name what a tool reads that the fleet keys already cover (see steps.mjs `covered`), and a
    // per-id accessor turns its table into per-id rows (steps.mjs PER_ID_ACCESSORS).
    const perIdTables = new Set();
    const skip = (from, to) => {
      const declaration = DECLARED_DYNAMIC[rel(from)];
      if (declaredNotInput(declaration, rel(to))) return true;
      const accessor = ACCESSORS[rel(from)];
      const names = [...(tableFiles.get(to) ?? [])];
      if (!accessor || !names.length || !names.every((name) => accessor.tables.includes(name))) return false;
      if (accessorPin(readFileSync(from, 'utf8'), accessor.exportName) !== accessor.pin) return false; // stale: whole table
      for (const name of names) perIdTables.add(name);
      return true;
    };
    const closure = graph.closure(entries, { stop: new Set([...coreSet, ...tableStop]), skip });
    const toolFiles = new Set(), foreignTables = new Set();
    for (const file of closure.files) {
      if (coreSet.has(file) || aggregateFiles.has(file) || ownFiles.has(file)) continue;
      if (tableFiles.has(file)) { foreignTables.add(file); continue; }
      toolFiles.add(file);
    }
    const toolExecuted = [...toolFiles].filter((file) => closure.expanded.has(file));
    if (step.device === 'gpu') {
      // A page also runs the worker modules its code hands to `new Worker(new URL(...))`; Node never does, so the
      // fleet partition only names them. Follow them (and what they import) as this step's own inputs.
      const executedCore = new Set([...coreSet].filter((file) => executed.has(file)));
      const roots = new Set();
      for (const file of [...executed, ...closure.expanded]) for (const url of graph.edges(file).urls) roots.add(rel(url));
      const pageWorkers = graph.closure([...roots], { stop: new Set([...executedCore, ...tableStop]), browser: true });
      for (const file of pageWorkers.files) {
        if (executedCore.has(file) || tableStop.has(file) || ownFiles.has(file)) continue;
        toolFiles.add(file);
        if (pageWorkers.expanded.has(file)) toolExecuted.push(file);
      }
    }
    for (const file of toolExecuted) {
      const problem = dynamicProblem(file);
      if (problem) reasons.push(problem);
    }
    const declaredReads = toolExecuted.flatMap((file) => DECLARED_DYNAMIC[rel(file)]?.reads ?? []);
    const readGlobs = [...(step.reads ?? []), ...declaredReads];
    const excluded = new Set([...ownFiles]);
    const readFiles = readGlobs.length
      ? expandGlobs(root, readGlobs, { exclude: [...(step.excludeReads ?? [])] }).map(abs).filter((file) => !excluded.has(file))
      : [];
    const tool = H(`step:${stepDefinition(step)}`, ...graph.rowsOf(new Set([...toolFiles, ...foreignTables]), { exclude: ownFiles }),
      ...readFiles.map((file) => `read:${rel(file)}:${graph.hashFile(file)}`),
      ...envRows(environmentOf(toolExecuted)));
    // Recorded (frame-checked) outputs: the tables' files and files written whole. `writes` files are bound to the rows
    // by the tool itself (the icon manifest holds each image's sha256), so they are not tracked file by file.
    const outputFiles = [...recorded].filter((file) => !aggregateFiles.has(file) || step.files.includes(rel(file)));
    stepStates[step.name] = {
      step, tool, reasons, decomposed: reasons.length === 0,
      outputFiles: outputFiles.map(rel).sort(),
      toolFiles: [...toolFiles].map(rel).sort(),
      foreignTables: [...foreignTables].map(rel).sort(),
      // rowReads: tables the step's tool reads at the id it measures, by a declared computed path (steps.mjs)
      rowTables: [...new Set([...buildReadTables, ...perIdTables, ...(step.rowReads ?? [])])].sort(),
    };
  }

  // Keys.
  const ids = data.roster.all;
  const groupOf = data.roster.groupById;
  const chainOf = (id) => data.chains[id] ?? [id];
  const allGroups = Object.keys(groups).sort();
  const groupChain = (id) => {
    const out = new Set();
    for (const member of chainOf(id)) {
      const group = groupOf[member];
      if (!group || !groups[group]) return allGroups; // no owner: every group could build it
      out.add(group);
    }
    return [...out].sort();
  };
  const builderKey = (id) => H(`core:${core}`, `roster:${roster}`, ...groupChain(id).map((group) => `group:${group}:${groups[group]}`));
  const rowOf = (table, id) => data.rows[table]?.[id] ?? 'absent';
  const rowsKey = (step, id) => {
    const parts = [];
    for (const table of stepStates[step.name].rowTables) for (const member of chainOf(id)) {
      if (member === id && step.outputs.includes(table)) continue;
      parts.push(`${table}:${member}:${rowOf(table, member)}`);
    }
    return H(...parts);
  };
  const inKey = (name, id) => {
    const state = stepStates[name];
    return H(`schema:${SCHEMA}`, `toolchain:${toolchain}`, `tool:${state.tool}`, `builder:${builderKey(id)}`, `rows:${rowsKey(state.step, id)}`);
  };
  const outKey = (name, id) => H(...stepStates[name].step.outputs.map((table) => `${table}:${rowOf(table, id)}`));
  const fileHash = (file) => graph.hashFile(abs(file)).slice(0, 16);

  // The world steps' per-map keys (tools/changed-only/world.mjs): null for a tree or fixture without world rows.
  const worldConfig = { ...DEFAULT_CONFIG.world, ...(config.world ?? {}) };
  const world = computeWorldState({
    root, graph, world: data.world, steps: worldSteps, toolchain, schema: SCHEMA, fleetEntries: [...FLEET_ENTRIES.map(abs)],
    fleetKey: H(`core:${core}`, `roster:${roster}`), builderKey, chainOf, rowOf, buildReadTables, dynamicProblem,
    environmentOf, envRows,
    config: { ...worldConfig, declared: DECLARED_DYNAMIC, expandGlobs, stepDefinition },
  });

  graph.persist();
  return {
    world,
    root, schema: SCHEMA, toolchain, toolchainParts, roster, core, groups, groupChain, chainOf, buildReadTables,
    tableNames: Object.keys(TABLES),
    steps: stepStates, ids, groupById: groupOf, rows: data.rows, fileIds: data.fileIds, errors: data.errors, globalReasons,
    inKey, outKey, builderKey, rowsKey, fileHash,
    partition: {
      core: [...coreSet].map(rel).sort(),
      groups: Object.fromEntries(Object.entries(groupFiles).map(([group, files]) => [group, [...files].map(rel).sort()])),
    },
  };
}

// ---------------------------------------------------------------- manifest

export function emptyManifest() {
  return { schema: SCHEMA, toolchain: null, roster: null, core: null, groups: {}, tools: {}, rows: {}, keys: {}, files: {}, comps: {} };
}

export function parseManifest(text) {
  const manifest = emptyManifest();
  const lines = text.split('\n').filter(Boolean);
  if (lines[0] !== `#schema ${SCHEMA}`) return null;
  for (const line of lines.slice(1)) {
    const [kind, ...fields] = line.split('\t');
    if (kind === 'toolchain') manifest.toolchain = fields[0];
    else if (kind === 'roster') manifest.roster = fields[0];
    else if (kind === 'core') manifest.core = fields[0];
    else if (kind === 'group') manifest.groups[fields[0]] = fields[1];
    else if (kind === 'tool') manifest.tools[fields[0]] = fields[1];
    else if (kind === 'row') (manifest.rows[fields[0]] ??= {})[fields[1]] = fields[2];
    else if (kind === 'key') (manifest.keys[fields[0]] ??= {})[fields[1]] = { in: fields[2], out: fields[3] };
    else if (kind === 'file') (manifest.files[fields[0]] ??= {})[fields[1]] = fields[2];
    else if (kind === 'comp') manifest.comps[fields[0]] = fields[1];
    else return null;
  }
  return manifest;
}

export function serializeManifest(manifest) {
  const lines = [];
  if (manifest.toolchain) lines.push(`toolchain\t${manifest.toolchain}`);
  if (manifest.roster) lines.push(`roster\t${manifest.roster}`);
  if (manifest.core) lines.push(`core\t${manifest.core}`);
  for (const [group, hash] of Object.entries(manifest.groups)) lines.push(`group\t${group}\t${hash}`);
  for (const [step, hash] of Object.entries(manifest.tools)) lines.push(`tool\t${step}\t${hash}`);
  for (const [table, rows] of Object.entries(manifest.rows)) for (const [id, hash] of Object.entries(rows)) lines.push(`row\t${table}\t${id}\t${hash}`);
  for (const [step, keys] of Object.entries(manifest.keys)) for (const [id, key] of Object.entries(keys)) lines.push(`key\t${step}\t${id}\t${key.in}\t${key.out}`);
  for (const [step, files] of Object.entries(manifest.files)) for (const [file, hash] of Object.entries(files)) lines.push(`file\t${step}\t${file}\t${hash}`);
  for (const [name, hash] of Object.entries(manifest.comps ?? {})) lines.push(`comp\t${name}\t${hash}`);
  return `#schema ${SCHEMA}\n${lines.sort().join('\n')}\n`;
}

export function readManifest(root, path = MANIFEST_PATH) {
  const file = resolve(root, path);
  if (!existsSync(file)) return null;
  try { return parseManifest(readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeManifest(root, manifest, path = MANIFEST_PATH) {
  const file = resolve(root, path);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, serializeManifest(manifest));
  renameSync(temporary, file);
}

/** The manifest to compare against: the working tree's, a file, or a git ref's committed copy (null if none). */
export function loadBase(root, base) {
  if (!base) return readManifest(root);
  try { return parseManifest(readFileSync(resolve(root, base), 'utf8')); } catch {}
  try {
    return parseManifest(execFileSync('git', ['show', `${base}:${MANIFEST_PATH}`], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch { return null; }
}

/** The manifest's component lines refreshed from a state (keys and files are recorded by the chain as steps run). */
export function refreshComponents(manifest, state) {
  manifest.toolchain = state.toolchain;
  manifest.roster = state.roster;
  manifest.core = state.core;
  manifest.groups = { ...state.groups };
  manifest.tools = Object.fromEntries(Object.entries(state.steps).map(([name, step]) => [name, step.tool]));
  manifest.rows = {};
  for (const table of state.tableNames) {
    const rows = state.rows[table] ?? {};
    if (Object.keys(rows).length) manifest.rows[table] = Object.fromEntries(Object.keys(rows).sort().map((id) => [id, rows[id]]));
  }
  // The world's component lines (what --explain compares a map against); a tree without world rows keeps them.
  if (state.world) manifest.comps = { ...state.world.comps };
  return manifest;
}

/** Record that `step` ran on `ids` (every id when null): inKeys taken before the run, outKeys and files after. */
export function recordStep(manifest, name, ids, inKeys, after) {
  const keys = (manifest.keys[name] ??= {});
  const ran = ids ?? after.ids;
  if (!ids) for (const id of Object.keys(keys)) if (!after.ids.includes(id)) delete keys[id];
  for (const id of ran) keys[id] = { in: inKeys[id], out: after.outKey(name, id) };
  manifest.files[name] = Object.fromEntries(after.steps[name].outputFiles.map((file) => [file, after.fileHash(file)]));
}

// ---------------------------------------------------------------- resolve

const reasonsFor = (manifest, state, name, id) => {
  const out = [];
  const step = state.steps[name];
  if (manifest.toolchain !== state.toolchain) out.push('toolchain');
  if (manifest.tools[name] !== step.tool) out.push(`tool ${step.step.tool} or its flags`);
  if (manifest.core !== state.core) out.push('core');
  for (const group of state.groupChain(id)) if (manifest.groups[group] !== state.groups[group]) out.push(`group ${group}`);
  for (const table of step.rowTables) for (const member of state.chainOf(id)) {
    if (member === id && step.step.outputs.includes(table)) continue;
    const before = manifest.rows[table]?.[member] ?? 'absent', now = state.rows[table]?.[member] ?? 'absent';
    if (before !== now) out.push(`row ${table}[${member}]`);
  }
  // Every component matches the manifest's latest snapshot, so the key moved through rows a later step of the last
  // chain rewrote after this step ran (the chain's next pass re-runs it).
  return out.length ? out : ['inputs rewritten after this step ran (a later step of the last chain)'];
};

/**
 * Which ids each step must run on. mode: 'none' | 'ids' (a subset) | 'all' (every id; the tool may run scoped) |
 * 'full' (the whole fleet without --ids: roster change, missing manifest, an output file's frame edited).
 */
export function resolveChanged(state, manifest, { steps = Object.keys(state.steps) } = {}) {
  const result = {};
  for (const name of steps) {
    const step = state.steps[name];
    const reasons = {};
    const all = (why, mode = 'all') => { result[name] = { mode, ids: [...state.ids], reasons: { '*': why } }; };
    if (!manifest) { all(['no manifest'], 'full'); continue; }
    const recordedRoster = state.rosterOf ? state.rosterOf(manifest) : manifest.roster;
    if (recordedRoster !== state.roster) { all([recordedRoster == null ? 'never recorded' : 'roster'], 'full'); continue; }
    if (!step.decomposed) { all(step.reasons); continue; }
    const keys = manifest.keys[name] ?? {};
    const changed = [];
    for (const id of state.ids) {
      const recorded = keys[id];
      if (!recorded) { changed.push(id); reasons[id] = ['no row']; continue; }
      const why = [];
      if (recorded.in !== state.inKey(name, id)) why.push(...(state.reasonsFor ? state.reasonsFor(manifest, name, id) : reasonsFor(manifest, state, name, id)));
      if (recorded.out !== state.outKey(name, id)) why.push('output edited outside chain');
      if (why.length) { changed.push(id); reasons[id] = why; }
    }
    // A differing output file none of whose ids changed was edited outside its rows (a frame or format edit): only a
    // whole-fleet run rewrites it the way a full regen would.
    const changedSet = new Set(changed);
    const frameEdits = Object.entries(manifest.files[name] ?? {}).filter(([file, hash]) => hash !== state.fileHash(file)
      && !(state.fileIds[file] ?? []).some((id) => changedSet.has(id)));
    const missingFiles = step.outputFiles.filter((file) => !(file in (manifest.files[name] ?? {})));
    if (frameEdits.length || missingFiles.length) {
      all([...frameEdits.map(([file]) => `output file edited: ${file}`), ...missingFiles.map((file) => `output file unrecorded: ${file}`)], 'full');
      continue;
    }
    result[name] = { mode: changed.length === 0 ? 'none' : changed.length === state.ids.length ? 'all' : 'ids', ids: changed, reasons };
  }
  return result;
}

export const tankHash = sha256;
