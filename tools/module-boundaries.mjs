// module-boundaries.mjs — the repository's layer and cycle rules over the runtime import graph (arch-1, 2026-11-27).
// docs/architecture/MAP.md draws the layers; docs/architecture/adr/0001-module-boundaries.md records the rules.
//
// Two checks, each against a shrink-only pin of the debt present when the rule was written
// (tools/module-boundaries.pin.mjs): a new violation fails, and so does a pinned one that is gone (unpin it), so the
// pin only ever shrinks.
// - Cycles: no two runtime modules import each other, directly or around a loop, through static imports (the edges
//   evaluated before a module runs). Lazy `import()` and Worker entries do not form an evaluation cycle.
// - Layers: a module never imports a layer above its own (RULES), by any runtime edge: static, lazy or Worker.
//   Type-only imports are erased and are not checked.
// tools/driver-boundaries.mjs keeps the finer simulation-core and driver rules (ARCHITECTURE §1.6); this file keeps the
// coarse direction every area follows. Edges come from the one import reader, tools/static-import-closure.mjs.
// First-party tooling: Kevin B. Liu.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { PINNED_CYCLES, PINNED_EDGES } from './module-boundaries.pin.mjs';
import { isRelativeSpecifier, moduleImportEdges, resolveImportSpecifier } from './static-import-closure.mjs';

/** The runtime's source roots: the page, the services, the serverless functions, the Workers and the edge middleware. */
const RUNTIME_ROOTS = Object.freeze(['src', 'server', 'api', 'cloudflare', 'middleware.ts']);
const SCRIPT_RE = /\.(?:[cm]?[jt]s)$/;
/**
 * Receipts and their support, fixtures and oracles, generation checks, the Workers' vitest suites and declarations: run by
 * the harness or the compiler, never by the product. (`src/ui/i18nChunkImport.browser.ts` ships: the page catalogs
 * alias it into every page.)
 */
const NOT_RUNTIME_RE = /(?:\.(?:selftest|test-support|test|gencheck|fixture)\.|\/test\/|Test(?:Oracle)?\.mjs$|\/vitest\.config\.|\.d\.ts$|\/node_modules\/)/;

/**
 * Build-time generators that live under src/: the Field Manual's chapters and search index, which
 * tools/docs-prerender.mjs runs in Node to write the prerendered pages. They may use tools/; shipped code never imports
 * them (rule shipped-imports-no-build-time).
 */
const BUILD_TIME = Object.freeze([/^src\/docs\/chapters\//, /^src\/docs\/searchIndex\.ts$/]);

/** The core's bot modules, which the simulation may import (ARCHITECTURE §1.6; tools/driver-boundaries.mjs CORE_GAME_MODULES). */
const NOT_CORE_GAME = /^src\/game\/(?!(?:ai|botAbilities|botConstruction)\.ts$)/;

/**
 * The layer rules: a module matching `from` (and not `except`) never imports one matching `to`. Each says why; MAP.md
 * draws them.
 * A new rule starts with its current violations pinned, so it can land before its migration.
 */
export const RULES = Object.freeze([
  {
    id: 'runtime-imports-no-tools',
    from: [/^(?:src|server|api|cloudflare)\//, /^middleware\.ts$/],
    except: BUILD_TIME,
    to: [/^tools\//],
    why: 'tools/ is the build and test harness: shipped code never imports it (a generator writes data the runtime reads)',
  },
  {
    id: 'shipped-imports-no-build-time',
    from: [/^(?:src|server|api|cloudflare)\//, /^middleware\.ts$/],
    except: BUILD_TIME,
    to: BUILD_TIME,
    why: 'the Field Manual chapters and search index run in Node at build time (tools/docs-prerender.mjs); the page loads their output',
  },
  {
    id: 'foundation-layers-import-no-shell',
    from: [/^src\/(?:sim|world|vehicles|engine|fx|audio)\//],
    to: [/^src\/(?:app|ui|mp|presentation|docs|gallery|dev|pad|techTree)\//, NOT_CORE_GAME, /^src\/main\.ts$/, /^server\//, /^api\//, /^cloudflare\//],
    why: 'simulation, world, vehicles, renderer, effects and audio sit below the drivers, the UI and the composition root: '
      + 'they receive what they need as parameters or from a shared leaf, never by reaching up',
  },
  {
    id: 'online-driver-imports-no-page-shell',
    from: [/^src\/mp\//],
    to: [/^src\/(?:app|ui|presentation|docs|gallery|dev|pad|techTree)\//, NOT_CORE_GAME, /^src\/main\.ts$/],
    why: 'the online driver runs the core for a room (ARCHITECTURE §1.6); the page shell and the local driver compose it, '
      + 'not the other way round',
  },
  {
    id: 'telemetry-beacon-is-a-leaf',
    from: [/^src\/entry\//],
    to: [/^src\/(?!entry\/)[^/]+\//, /^src\/[^/]+\.[cm]?[jt]s$/, /^server\//, /^api\//, /^cloudflare\//],
    why: 'src/entry is the entry-telemetry beacon and its record schema: it loads before the renderer, so every layer may '
      + 'import it and it imports nothing outside itself (docs/ENTRY-RESILIENCE.md); the services take only its schema',
  },
  {
    id: 'services-import-no-page',
    from: [/^server\//, /^cloudflare\//, /^api\//],
    to: [/^src\/(?:app|ui|engine|fx|audio|presentation|docs|gallery|dev|techTree)\//, /^src\/entry\/telemetry\.ts$/, NOT_CORE_GAME, /^src\/main\.ts$/],
    why: 'the room services, Workers and serverless functions run headless: they share the core and the wire, never the page',
  },
]);

const toKey = (rootDir, path) => relative(rootDir, path).split('\\').join('/');

/** The runtime modules of a checkout (git's index), receipts and declarations aside. */
export function runtimeModules(root = process.cwd()) {
  return execFileSync('git', ['ls-files', ...RUNTIME_ROOTS], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => SCRIPT_RE.test(file) && !NOT_RUNTIME_RE.test(file));
}

/**
 * The runtime import graph over `files`: a Map from each module to its resolved relative edges [{ to, kind }], type-only
 * edges aside; `graph.unresolved` lists the relative specifiers that name no file ('from -> specifier'), which the
 * checks report rather than drop. `read(file)` supplies sources, so a receipt can seed a violation without touching the tree.
 */
export function runtimeGraph({ root = process.cwd(), files = runtimeModules(root), read = (file) => readFileSync(resolve(root, file), 'utf8') } = {}) {
  const rootDir = resolve(root);
  const graph = new Map();
  graph.unresolved = [];
  for (const file of files) {
    const edges = [];
    for (const edge of moduleImportEdges(read(file), file)) {
      if (edge.kind === 'type' || !isRelativeSpecifier(edge.specifier)) continue;
      const target = resolveImportSpecifier(resolve(rootDir, file), edge.specifier);
      if (target) edges.push({ to: toKey(rootDir, target), kind: edge.kind });
      else graph.unresolved.push(`${file} -> ${edge.specifier}`);
    }
    graph.set(file, edges);
  }
  return graph;
}

/** The strongly connected components larger than one module over the static edges, each sorted, sorted by first module. */
export function staticCycles(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const cycles = [];
  let next = 0;
  const successors = (file) => (graph.get(file) ?? []).filter((edge) => edge.kind === 'static' && graph.has(edge.to)).map((edge) => edge.to);
  for (const start of graph.keys()) {
    if (index.has(start)) continue;
    // iterative Tarjan: each frame is [module, its successors, the next successor to visit]
    const frames = [[start, successors(start), 0]];
    index.set(start, next); low.set(start, next); next++; stack.push(start); onStack.add(start);
    while (frames.length) {
      const frame = frames[frames.length - 1];
      const [file, outs] = frame;
      if (frame[2] < outs.length) {
        const to = outs[frame[2]++];
        if (!index.has(to)) {
          index.set(to, next); low.set(to, next); next++; stack.push(to); onStack.add(to);
          frames.push([to, successors(to), 0]);
        } else if (onStack.has(to)) low.set(file, Math.min(low.get(file), index.get(to)));
        continue;
      }
      frames.pop();
      if (frames.length) { const parent = frames[frames.length - 1][0]; low.set(parent, Math.min(low.get(parent), low.get(file))); }
      if (low.get(file) !== index.get(file)) continue;
      const component = [];
      let member;
      do { member = stack.pop(); onStack.delete(member); component.push(member); } while (member !== file);
      if (component.length > 1) cycles.push(component.sort());
    }
  }
  return cycles.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Every edge breaking a layer rule: Map rule id -> sorted 'from -> to' lines. */
export function layerEdges(graph, rules = RULES) {
  const found = new Map(rules.map((rule) => [rule.id, new Set()]));
  for (const [file, edges] of graph) {
    for (const rule of rules) {
      if (!rule.from.some((pattern) => pattern.test(file)) || rule.except?.some((pattern) => pattern.test(file))) continue;
      for (const edge of edges) if (rule.to.some((pattern) => pattern.test(edge.to))) found.get(rule.id).add(`${file} -> ${edge.to}`);
    }
  }
  return new Map([...found].map(([id, lines]) => [id, [...lines].sort()]));
}

/**
 * Both checks against the pin. Returns { violations, cycles, edges }: a new cycle or layer edge, and a pinned one that
 * no longer exists (the pin only shrinks).
 */
export function moduleBoundaryViolations({ graph = runtimeGraph(), rules = RULES, pinnedCycles = PINNED_CYCLES, pinnedEdges = PINNED_EDGES } = {}) {
  const violations = (graph.unresolved ?? []).map((line) => `unresolved import (no file): ${line}`);
  const cycles = staticCycles(graph);
  const cycleKey = (cycle) => [...cycle].sort().join(' <-> ');
  const pinnedCycleKeys = new Set(pinnedCycles.map(cycleKey));
  const cycleKeys = new Set(cycles.map(cycleKey));
  for (const key of cycleKeys) if (!pinnedCycleKeys.has(key)) violations.push(`import cycle (static imports): ${key}`);
  for (const key of pinnedCycleKeys) if (!cycleKeys.has(key)) violations.push(`pinned import cycle no longer exists as pinned (update the pin): ${key}`);
  const edges = layerEdges(graph, rules);
  for (const rule of rules) {
    const pinned = new Set(pinnedEdges[rule.id] ?? []);
    const actual = new Set(edges.get(rule.id));
    for (const line of actual) if (!pinned.has(line)) violations.push(`layer rule ${rule.id}: ${line} (${rule.why})`);
    for (const line of pinned) if (!actual.has(line)) violations.push(`pinned ${rule.id} edge no longer exists (unpin it): ${line}`);
  }
  for (const id of Object.keys(pinnedEdges)) if (!rules.some((rule) => rule.id === id)) violations.push(`pin names an unknown rule: ${id}`);
  return { violations, cycles, edges };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { violations, cycles, edges } = moduleBoundaryViolations();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ violations, cycles, edges: Object.fromEntries(edges) }, null, 2));
  } else {
    for (const line of violations) console.log(line);
    const pinnedEdgeCount = [...edges.values()].reduce((sum, lines) => sum + lines.length, 0);
    console.log(`module-boundaries: ${cycles.length} import cycles, ${pinnedEdgeCount} layer edges against the pin; ${violations.length} violations`);
  }
  process.exitCode = violations.length ? 1 : 0;
}
