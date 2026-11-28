// module-boundaries.selftest.mjs — the layer and cycle rules hold on the tree, against their shrink-only pin, and each
// check catches a seeded violation (tools/module-boundaries.mjs, docs/architecture/adr/0001-module-boundaries.md).
// It also keeps one import reader: no other module resolves import specifiers on its own (tools/static-import-closure.mjs).
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RULES, layerEdges, moduleBoundaryViolations, runtimeGraph, staticCycles } from './module-boundaries.mjs';

const root = resolve(import.meta.dirname, '..');

// 1. The tree: no cycle or layer edge outside the pin, and no stale pin line.
const graph = runtimeGraph({ root });
const tree = moduleBoundaryViolations({ graph });
assert.deepEqual(tree.violations, [], `module boundaries:\n${tree.violations.join('\n')}`);
assert.ok(graph.size > 2000, `the runtime graph lists the page, the services and the Workers (${graph.size} modules)`);

// 2. Seeded through the reader: real modules with planted sources (the resolver needs files that exist).
const seeded = {
  'src/sim/matchRuleset.ts': "import './damage.ts';\nimport type { T } from '../ui/hud.ts';\nexport const a = () => import('../ui/i18n.ts');\n",
  'src/sim/damage.ts': "export { a } from './matchRuleset.ts';\n",
  'src/fx/effects.ts': "import '../app/lazyChunk.ts';\nimport '../../tools/static-import-closure.mjs';\n",
  // a build-time chapter may use tools/; a shipped module may not import the chapter
  'src/docs/chapters/modes.ts': "import '../../../tools/static-import-closure.mjs';\n",
  'src/ui/hud.ts': "import '../docs/chapters/index.ts';\n",
  // the beacon imports only within src/entry
  'src/entry/telemetry.ts': "import './telemetrySchema.ts';\nimport '../ui/i18n.ts';\n",
};
const seededGraph = runtimeGraph({ root, files: Object.keys(seeded), read: (file) => seeded[file] });
assert.deepEqual(staticCycles(seededGraph), [['src/sim/damage.ts', 'src/sim/matchRuleset.ts']], 'a static import loop is a cycle');
const seededEdges = layerEdges(seededGraph);
assert.deepEqual(seededEdges.get('foundation-layers-import-no-shell'), [
  'src/fx/effects.ts -> src/app/lazyChunk.ts',
  'src/sim/matchRuleset.ts -> src/ui/i18n.ts',
], 'a lazy import counts for layers; a type-only import does not');
assert.deepEqual(seededEdges.get('runtime-imports-no-tools'), ['src/fx/effects.ts -> tools/static-import-closure.mjs'],
  'a build-time chapter may import tools/');
assert.deepEqual(seededEdges.get('shipped-imports-no-build-time'), ['src/ui/hud.ts -> src/docs/chapters/index.ts']);
assert.deepEqual(seededEdges.get('telemetry-beacon-is-a-leaf'), ['src/entry/telemetry.ts -> src/ui/i18n.ts']);
const seededResult = moduleBoundaryViolations({ graph: seededGraph, pinnedCycles: [], pinnedEdges: {} });
assert.equal(seededResult.violations.length, 6, `cycle + five layer edges:\n${seededResult.violations.join('\n')}`);
assert.ok(seededResult.violations[0].startsWith('import cycle (static imports): src/sim/damage.ts <-> src/sim/matchRuleset.ts'));

// A relative import naming no file is reported, not dropped.
const unresolved = runtimeGraph({ root, files: ['src/sim/matchRuleset.ts'], read: () => "import './noSuchModule.mjs';\n" });
assert.deepEqual(moduleBoundaryViolations({ graph: unresolved, pinnedCycles: [], pinnedEdges: {} }).violations,
  ['unresolved import (no file): src/sim/matchRuleset.ts -> ./noSuchModule.mjs']);

// A lazy loop is not an evaluation cycle.
const lazyLoop = new Map([['src/a.ts', [{ to: 'src/b.ts', kind: 'lazy' }]], ['src/b.ts', [{ to: 'src/a.ts', kind: 'static' }]]]);
assert.deepEqual(staticCycles(lazyLoop), []);

// 3. The pin only shrinks: a pinned cycle or edge that no longer exists fails, and so does a pin for an unknown rule.
const stale = moduleBoundaryViolations({
  graph: new Map([['src/sim/x.ts', []]]),
  pinnedCycles: [['src/sim/x.ts', 'src/sim/y.ts']],
  pinnedEdges: { 'foundation-layers-import-no-shell': ['src/sim/x.ts -> src/ui/i18n.ts'], 'no-such-rule': [] },
});
assert.deepEqual(stale.violations, [
  'pinned import cycle no longer exists as pinned (update the pin): src/sim/x.ts <-> src/sim/y.ts',
  'pinned foundation-layers-import-no-shell edge no longer exists (unpin it): src/sim/x.ts -> src/ui/i18n.ts',
  'pin names an unknown rule: no-such-rule',
]);
// A pinned cycle that grows is a new cycle and its old pin is stale.
const grown = new Map([
  ['src/sim/x.ts', [{ to: 'src/sim/y.ts', kind: 'static' }]], ['src/sim/y.ts', [{ to: 'src/sim/z.ts', kind: 'static' }]],
  ['src/sim/z.ts', [{ to: 'src/sim/x.ts', kind: 'static' }]],
]);
assert.equal(moduleBoundaryViolations({ graph: grown, pinnedCycles: [['src/sim/x.ts', 'src/sim/y.ts']], pinnedEdges: {} }).violations.length, 2);
for (const rule of RULES) assert.ok(rule.why && rule.from.length && rule.to.length, `rule ${rule.id} states its scope and reason`);

// 4. One import reader. Specifier resolvers outside tools/static-import-closure.mjs, shrink-only: the selftest cache and
// the changed-only graph follow template and glob specifiers on the TypeScript compiler's AST (BACKLOG T-graph-2), and the
// lazy-chunk census resolves inside its own source scan.
const RESOLVER_PIN = new Set(['src/app/lazyChunkSites.selftest.mjs', 'tools/changed-only/graph.mjs', 'tools/selftest-cache.mjs']);
const scanned = execFileSync('git', ['ls-files', 'tools', 'src', 'server', 'api', 'cloudflare', 'scripts'], { cwd: root, encoding: 'utf8' }).split('\n')
  .filter((file) => /\.(?:[cm]?[jt]s)$/.test(file) && file !== 'tools/static-import-closure.mjs' && file !== 'tools/module-boundaries.selftest.mjs');
const resolvers = scanned.filter((file) => /(?:function|const|let)\s+resolve(?:\w*Specifier|Relative\w*)\b/.test(readFileSync(resolve(root, file), 'utf8')));
assert.deepEqual(resolvers.filter((file) => !RESOLVER_PIN.has(file)), [],
  'resolve import specifiers with resolveImportSpecifier from tools/static-import-closure.mjs, not a new resolver');
assert.deepEqual([...RESOLVER_PIN].filter((file) => !resolvers.includes(file)), [], 'a pinned resolver is gone: unpin it');

const edgeCount = [...tree.edges.values()].reduce((sum, lines) => sum + lines.length, 0);
console.log(`module-boundaries.selftest: ${graph.size} runtime modules; ${tree.cycles.length} pinned cycles and ${edgeCount} pinned layer `
  + `edges (shrink-only), none new; ${RULES.length} layer rules; seeded cycle, layer, stale-pin, unresolved and resolver checks caught`);
