// Changed-only fingerprints for the world steps: which (step, map) pairs must be regenerated. First-party tooling:
// Kevin B. Liu.
//
// The world steps (steps.mjs WORLD_STEPS: the wreck bake plan, the collision shards, the assault-trench shards) build
// battlefields in Node. Their keys mirror the fleet's, per map instead of per tank id:
//   inKey(step, map)  = H(schema, toolchain, tool(step), mapConfig(step, map), fleet, donors(step, map))
//   outKey(step, map) = H(the map's rows in every table the step writes)
//   tool(step)        = the step definition, the tool's static closure stopped at the fleet entry modules and with the map
//                       registry's config imports dropped (the world core), its declared dynamic reads and the environment
//                       variables any closure file reads (with values). The steps' own outputs are never inputs.
//   mapConfig(step,m) = the files the map's config module reaches beyond that world core (a config another config
//                       imports is in both)
//   fleet             = the fleet's shared core and roster (specs, factory, kits, materials, generated spec data): every map
//                       imports the fleet entry modules (the wreck casts filter on spec data), so every map takes them
//   donors(step, m)   = per donor id: its builder key and build-read rows (the fleet's builderKey and rows, chain-wide)
// A map is changed when its row is missing, its inKey moved or its outKey moved. A world file that reaches the fleet
// through an entry module must be declared and pinned (FLEET_API_USERS), every dynamic read declared and pinned
// (DECLARED_DYNAMIC), or the step runs on every map. A frame edit of a written file (index version, seeds, plan header)
// runs the step on every map in whole-world mode.
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript-compiler-api';
import { h16 } from './graph.mjs';

const H = (...parts) => h16(parts.join('\n'));

/** CONFIGS in the map registry: map id -> the module specifier its config is imported from. Throws on anything else. */
export function parseMapRegistry(text, filename) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const defaults = new Map();
  let configs = null;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.name && ts.isStringLiteral(statement.moduleSpecifier)) {
      defaults.set(statement.importClause.name.text, statement.moduleSpecifier.text);
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'CONFIGS') continue;
        let expression = declaration.initializer;
        while (expression && (ts.isSatisfiesExpression?.(expression) || ts.isAsExpression(expression) || ts.isParenthesizedExpression(expression))) {
          expression = expression.expression;
        }
        if (expression && ts.isObjectLiteralExpression(expression)) configs = expression;
      }
    }
  }
  if (!configs) throw new Error(`${filename}: CONFIGS object not found`);
  const out = {};
  for (const property of configs.properties) {
    let key, value;
    if (ts.isShorthandPropertyAssignment(property)) { key = property.name.text; value = property.name.text; }
    else if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.initializer)) {
      key = property.name.getText(source).replace(/^['"]|['"]$/g, ''); value = property.initializer.text;
    } else throw new Error(`${filename}: CONFIGS entry ${property.getText(source).slice(0, 40)} is not an imported config`);
    if (!defaults.has(value)) throw new Error(`${filename}: CONFIGS.${key} is not a default import`);
    out[key] = defaults.get(value);
  }
  return out;
}

/** sha256/16 of the sorted trimmed lines of `text` naming any token: the pin a FLEET_API_USERS declaration binds. */
export function tokenPin(text, tokens) {
  return h16(text.split('\n').map((line) => line.trim()).filter((line) => tokens.some((token) => line.includes(token))).sort().join('\n'));
}

/**
 * The world half of the fingerprint state. `ctx` comes from computeState (fingerprint.mjs): the graph, the fleet's
 * partition and keys, the dynamic-read checker. Returns null when the tree has no world data (a fixture fleet).
 */
export function computeWorldState(ctx) {
  const { root, graph, world: data, steps, toolchain, schema, fleetEntries, builderKey, chainOf,
    rowOf, buildReadTables, dynamicProblem, environmentOf, envRows, config, fleetKey } = ctx;
  if (!data || !steps.length) return null;
  const abs = (rel) => resolve(root, rel), rel = (path) => relative(root, path);
  const globalReasons = data.errors.map((error) => `world rows: ${error}`);
  const mapIds = data.mapIds;

  let registry = {};
  try { registry = parseMapRegistry(readFileSync(abs(config.registryFile), 'utf8'), config.registryFile); }
  catch (error) { globalReasons.push(`map registry: ${error.message}`); }
  const registryFile = abs(config.registryFile);
  const configFile = Object.fromEntries(Object.entries(registry).map(([map, specifier]) => [map, resolve(dirname(registryFile), specifier)]));
  const configFiles = new Set(Object.values(configFile));
  for (const map of mapIds) if (!configFile[map]) globalReasons.push(`map registry: no config for ${map}`);
  const roster = H(JSON.stringify(mapIds), JSON.stringify(Object.entries(registry).sort()));

  const outputRoots = config.outputs.map(abs);
  const isOutput = (file) => outputRoots.some((root) => file === root || file.startsWith(`${root}/`));
  const fleetStop = new Set(fleetEntries);

  const stepStates = {}, comps = { 'world:roster': roster, 'world:fleet': fleetKey };
  for (const step of steps) {
    const reasons = [...globalReasons];
    const skip = (from, to) => {
      if (from === registryFile && configFiles.has(to)) return true; // the registry's config imports: per map
      const declaration = config.declared[rel(from)];
      return [...(declaration?.modeOnly ?? []), ...(declaration?.covered ?? [])].includes(rel(to));
    };
    const closure = graph.closure([step.tool, ...(step.entries ?? [])], { stop: fleetStop, skip });
    const toolFiles = new Set([...closure.files].filter((file) => !fleetStop.has(file) && !isOutput(file)));
    const executed = [...closure.expanded].filter((file) => toolFiles.has(file));
    // Each map's own files: what its config module reaches beyond the world core.
    const mapFiles = {}, mapExecuted = new Set();
    for (const map of mapIds) {
      if (!configFile[map]) continue;
      const own = graph.closure([rel(configFile[map])], { stop: new Set([...toolFiles, ...fleetStop]), skip });
      mapFiles[map] = new Set([...own.files].filter((file) => !toolFiles.has(file) && !fleetStop.has(file) && !isOutput(file)));
      for (const file of own.expanded) if (mapFiles[map].has(file)) mapExecuted.add(file);
    }
    for (const file of new Set([...executed, ...mapExecuted])) {
      const problem = dynamicProblem(file);
      if (problem) reasons.push(problem);
      // A world file that imports a fleet entry module must be a declared, pinned user of the per-id API.
      if ([...graph.edges(file).exec].some((target) => fleetStop.has(target))) {
        const declaration = config.fleetApiUsers[rel(file)];
        if (!declaration) reasons.push(`undeclared fleet use in ${rel(file)}`);
        else {
          const pin = tokenPin(readFileSync(file, 'utf8'), config.fleetApiTokens);
          if (pin !== declaration.pin) reasons.push(`fleet use pin stale for ${rel(file)} (now ${pin})`);
        }
      }
    }
    const declaredReads = [...new Set([...executed, ...mapExecuted])].flatMap((file) => config.declared[rel(file)]?.reads ?? []);
    const readFiles = config.expandGlobs(root, declaredReads).map(abs).filter((file) => !isOutput(file));
    const tool = H(`step:${config.stepDefinition(step)}`, ...graph.rowsOf(toolFiles),
      ...readFiles.map((file) => `read:${rel(file)}:${graph.hashFile(file)}`), ...envRows(environmentOf([...executed, ...mapExecuted])));
    comps[`world:tool:${step.name}`] = tool;
    const mapKey = {};
    for (const map of mapIds) {
      mapKey[map] = H(...graph.rowsOf(mapFiles[map] ?? new Set()));
      comps[`world:map:${step.name}:${map}`] = mapKey[map];
    }
    stepStates[step.name] = {
      step, tool, mapKey, reasons, decomposed: reasons.length === 0,
      outputFiles: [...step.files].sort(),
      toolFiles: [...toolFiles].map(rel).sort(),
      mapFiles: Object.fromEntries(Object.entries(mapFiles).map(([map, files]) => [map, [...files].map(rel).sort()])),
    };
  }

  // Donors: the wreck plan's rows (every variant), the roster ids the config names, or the whole cast without a plan.
  const donorsOf = (name, map) => {
    const entry = data.donors[map] ?? { plan: [], named: [], cast: [], wrecks: 0 };
    const planned = entry.plan.length ? entry.plan : entry.wrecks > 0 ? entry.cast : [];
    return [...new Set([...planned, ...entry.named])].sort();
  };
  const donorKey = (id) => H(`builder:${builderKey(id)}`,
    ...buildReadTables.flatMap((table) => chainOf(id).map((member) => `${table}:${member}:${rowOf(table, member)}`)));
  const donorsKey = (name, map) => H(...donorsOf(name, map).map((id) => `${id}:${donorKey(id)}`));
  for (const step of steps) for (const map of mapIds) comps[`world:donors:${step.name}:${map}`] = donorsKey(step.name, map);

  const worldRow = (table, map) => data.rows[table]?.[map] ?? 'absent';
  const inKey = (name, map) => {
    const state = stepStates[name];
    return H(`schema:${schema}`, `toolchain:${toolchain}`, `tool:${state.tool}`, `map:${state.mapKey[map]}`,
      `fleet:${fleetKey}`, `donors:${donorsKey(name, map)}`);
  };
  const outKey = (name, map) => H(...stepStates[name].step.outputs.map((table) => `${table}:${worldRow(table, map)}`));
  // A written file's frame: the file without its per-map rows (the rows are compared per map).
  const fileHash = (file) => data.frames[file] ?? 'missing';

  const reasonsFor = (manifest, name, map) => {
    const out = [];
    const recorded = (key) => manifest.comps?.[key];
    if (manifest.toolchain !== toolchain) out.push('toolchain');
    if (recorded(`world:tool:${name}`) !== stepStates[name].tool) out.push(`tool ${stepStates[name].step.tool}, its world core or its flags`);
    if (recorded(`world:map:${name}:${map}`) !== stepStates[name].mapKey[map]) out.push(`map config ${map}`);
    if (recorded('world:fleet') !== fleetKey) out.push('fleet core or roster');
    if (recorded(`world:donors:${name}:${map}`) !== donorsKey(name, map)) out.push(`donors ${donorsOf(name, map).join(',')}`);
    return out.length ? out : ['inputs rewritten after this step ran (a later step of the last chain)'];
  };

  return {
    universe: 'maps', root, ids: [...mapIds], roster, toolchain, steps: stepStates, comps, globalReasons,
    inKey, outKey, fileHash, fileIds: {}, donorsOf, reasonsFor,
    rosterOf: (manifest) => manifest.comps?.['world:roster'] ?? null,
  };
}
