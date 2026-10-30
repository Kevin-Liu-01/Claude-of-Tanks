// driver-boundaries.mjs — one shared game core, two thin drivers (the owner, 2026-10-29; docs/ARCHITECTURE.md "One core,
// two drivers"). The checks tools/driver-boundaries.selftest.mjs runs, over the import graph: static imports, lazy
// `import()` and `new URL('./x.ts', import.meta.url)` Worker entries (a Worker is code the page runs too), type-only
// imports aside. Every check takes `read(file)` so a receipt can seed a violation without touching the tree.
// First-party tooling: Kevin B. Liu.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const SCRIPT_RE = /\.(?:[cm]?[jt]s)$/;

/** The shared core: the simulation, plus the bot brains and the kernels' loader that live beside their callers. */
const CORE_EXTRA_ROOTS = Object.freeze(['src/game/ai.ts', 'src/game/botAbilities.ts', 'src/world/wasmWorldKernels.ts']);
/**
 * Core modules a lane landing beside this one adds, checked as core once present: the page's kernel provider, split from
 * world/soloWorldKernels.ts so Node runs it (item/local-fps-265 90189a90f7).
 */
const CORE_PENDING_ROOTS = Object.freeze(['src/world/soloWorldKernelProvider.ts']);
/** The core's modules outside src/sim that are core (the bots): nothing else under src/game is. */
const CORE_GAME_MODULES = Object.freeze(['src/game/ai.ts', 'src/game/botAbilities.ts']);
/** Code the core never reaches: either driver's, the composition root, and the presentation around them. */
const CORE_FORBIDDEN = Object.freeze([
  /^src\/mp\//, /^server\//, /^src\/main\.ts$/, /^src\/app\//, /^src\/entry\//, /^src\/presentation\//, /^src\/gallery\//,
  /^src\/docs\//, /^src\/dev\//, /^src\/audio\//, /^src\/fx\//, /^src\/techTree\//,
]);
/** three.js's math, which the core may use: no scene graph, geometry, material, texture or renderer. */
const THREE_MATH = Object.freeze(new Set(['Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4', 'Box2',
  'Box3', 'Sphere', 'Ray', 'Plane', 'Triangle', 'Line3', 'MathUtils', 'Spherical', 'Cylindrical']));
/** Browser globals the core never names (a Node authority has none of them). */
const DOM_GLOBALS = Object.freeze(new Set(['document', 'window', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Image', 'OffscreenCanvas',
  'Worker', 'self', 'indexedDB', 'matchMedia', 'getComputedStyle', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'WebGLRenderingContext',
  'WebGL2RenderingContext', 'createImageBitmap']));

/** The local driver's owners: a local battle, the campaign, the Proving Ground, Watch, replays, the Jev opponent. */
const LOCAL_DRIVER_ENTRIES = Object.freeze([
  'src/game/state.ts', 'src/game/soloBattleRuntime.ts', 'src/game/soloBattleAccess.ts', 'src/game/soloBattleEntryRuntime.ts',
  'src/game/soloBattleLoadingRuntime.ts', 'src/game/soloBattleLoadingAccess.ts', 'src/game/soloBattleStartRuntime.ts',
  'src/game/soloBattleStartAccess.ts', 'src/game/soloBattleDeploymentRuntime.ts', 'src/game/soloBattleDeploymentAccess.ts',
  'src/game/soloConsumables.ts', 'src/game/soloRosterPlan.ts', 'src/game/battleFrameRuntime.ts', 'src/game/provingGroundSession.ts',
  'src/game/provingRange.ts', 'src/game/watchController.ts', 'src/game/watchSeat.ts', 'src/game/killcam.ts', 'src/game/killcamAccess.ts',
  'src/game/replayPose.ts', 'src/game/campaignOperations.ts', 'src/game/campaignProgress.ts', 'src/game/campaignDebrief.ts',
  'src/game/jevCommander.ts', 'src/world/soloWorldKernels.ts',
  // the local Worker driver (?localDriver=worker): its page end, and through its Worker edge the Worker's step
  'src/game/localSimDriver.ts',
]);
/** The online driver's client stack, which a local battle never reaches by any edge. */
const ONLINE_CLIENT_STACK = /^src\/mp\/(?:match|presentation|transport|wire|session)\//;
/** And the rest of the online driver (rooms, the host, the server's actor and room service), which it never reaches either. */
const ONLINE_DRIVER = /^(?:src\/mp\/|server\/match\/|server\/rooms\/)/;

/** main.ts's local battle entries: they start a battle on the page and touch nothing of the online composition. */
const MAIN_LOCAL_ENTRIES = Object.freeze(['beginLocalBattleEntry', 'beginLocalBattle']);
/**
 * main.ts's top-level declarations that compose the online driver or a surface that offers it (the Play menu, a room
 * invite at startup): the only places it may name a src/mp module (a static import's binding or a lazy import) or a
 * module whose closure reaches the client stack. A new one is added here on purpose.
 */
const MAIN_ONLINE_DECLARATIONS = Object.freeze([
  'importMultiplayerV2Modules', 'loadMultiplayerV2Composition', 'loadMultiplayerLobby', 'multiplayerLobby', 'onlineMatch',
  'onlineMatchActive', 'onlinePump', 'multiplayerAppPorts', 'networkBattleIntentCover', 'beginMultiplayerV2Battle',
  'presentationScenePorts', 'loadPlayMenuModule', 'playSurface', 'startupIntent',
]);

const key = (root, path) => relative(root, path).split('\\').join('/');

function resolveSpecifier(fromFile, specifier) {
  const path = resolve(dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  if (existsSync(path) && SCRIPT_RE.test(path)) return path;
  if (path.endsWith('.js') && existsSync(`${path.slice(0, -3)}.ts`)) return `${path.slice(0, -3)}.ts`;
  for (const candidate of [`${path}.ts`, resolve(path, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return existsSync(path) ? path : null;
}

function walk(node, visit, parent = null, field = null) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) walk(item, visit, parent, field); return; }
  if (typeof node.type === 'string') visit(node, parent, field);
  for (const name of Object.keys(node)) {
    if (name === 'parent') continue;
    const value = node[name];
    if (value && typeof value === 'object') walk(value, visit, typeof node.type === 'string' ? node : parent, name);
  }
}

const isLiteralString = (node) => node?.type === 'Literal' && typeof node.value === 'string';
const isImportMetaUrl = (node) => node?.type === 'MemberExpression' && node.object?.type === 'MetaProperty' && node.property?.name === 'url';

const analysed = new Map();
/**
 * One parse a module and source, its edges and render-side uses kept (never the tree: the local driver's closure is
 * 1,200 modules); a reader's cached string is the same string, a seeded override another.
 */
function analysisOf(source, file) {
  const hit = analysed.get(file);
  if (hit && hit.source === source) return hit;
  const program = parseAst(String(source), { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const entry = { source, edges: edgesOf(program), uses: usesOf(program) };
  analysed.set(file, entry);
  return entry;
}

/** One module's runtime edges: { specifier, kind: 'static' | 'lazy' | 'worker' }. */
function moduleEdges(source, file = 'module.ts') {
  return analysisOf(source, file).edges;
}

function edgesOf(program) {
  const edges = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type') edges.push({ specifier: node.source.value, kind: 'static' });
    else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source && node.exportKind !== 'type') {
      edges.push({ specifier: node.source.value, kind: 'static' });
    }
  }
  walk(program, (node) => {
    if (node.type === 'ImportExpression' && isLiteralString(node.source)) edges.push({ specifier: node.source.value, kind: 'lazy' });
    if (node.type === 'NewExpression' && node.callee?.name === 'URL' && isLiteralString(node.arguments?.[0]) && isImportMetaUrl(node.arguments?.[1])
      && SCRIPT_RE.test(node.arguments[0].value)) edges.push({ specifier: node.arguments[0].value, kind: 'worker' });
  });
  return edges.filter((edge) => typeof edge.specifier === 'string' && (edge.specifier.startsWith('./') || edge.specifier.startsWith('../')));
}

/** A reader over the checkout, with `overrides` (repo path -> source) standing in for files: a receipt's seeded violation. */
export function checkoutReader(root = process.cwd(), overrides = {}) {
  const cache = new Map();
  return (file) => {
    if (Object.hasOwn(overrides, file)) return overrides[file];
    if (!cache.has(file)) cache.set(file, readFileSync(resolve(root, file), 'utf8'));
    return cache.get(file);
  };
}

/**
 * Every module reached from `entries` by any runtime edge: a Map from repo path to { from, kind } (null for an entry).
 * `extraEdges` (repo path -> [{ to, kind }]) adds edges a receipt seeds.
 */
function runtimeClosure(entries, { root = process.cwd(), read = checkoutReader(root), extraEdges = {}, edgesOut = false } = {}) {
  const rootDir = resolve(root);
  const reached = new Map();
  const edgesByFile = new Map();
  const queue = [];
  for (const entry of entries) { reached.set(entry, null); queue.push(entry); }
  while (queue.length) {
    const file = queue.shift();
    if (!SCRIPT_RE.test(file)) continue;
    const edges = moduleEdges(read(file), file).map((edge) => {
      const target = resolveSpecifier(resolve(rootDir, file), edge.specifier);
      return target ? { to: key(rootDir, target), kind: edge.kind } : null;
    }).filter(Boolean);
    const all = [...edges, ...(extraEdges[file] ?? [])];
    if (edgesOut) edgesByFile.set(file, all);
    for (const edge of all) {
      if (reached.has(edge.to)) continue;
      reached.set(edge.to, { from: file, kind: edge.kind });
      queue.push(edge.to);
    }
  }
  if (edgesOut) reached.edgesByFile = edgesByFile;
  return reached;
}

/** The chain from an entry to `file` inside a closure, for failure messages. */
function closureChain(closure, file) {
  const chain = [];
  for (let current = file; current; current = closure.get(current)?.from ?? null) {
    const step = closure.get(current);
    chain.unshift(step ? `${current} (${step.kind})` : current);
    if (chain.length > closure.size) break;
  }
  return chain.join(' -> ');
}

/** The core's roots: every module under src/sim (receipts and test support aside) and the extra roots. */
function coreRoots(root = process.cwd()) {
  const listed = execFileSync('git', ['ls-files', 'src/sim'], { cwd: root, encoding: 'utf8' }).split('\n')
    .filter((file) => file.endsWith('.ts') && !/\.(?:selftest|test-support)\./.test(file));
  return [...listed, ...CORE_EXTRA_ROOTS, ...CORE_PENDING_ROOTS.filter((file) => existsSync(resolve(root, file)))];
}

/** What a module names that the core may not: three.js beyond its math, browser globals. */
function renderSideUses(source, file = 'module.ts') {
  return analysisOf(source, file).uses;
}

function usesOf(program) {
  const uses = new Set();
  const declared = new Set();
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type' || node.source.value !== 'three') continue;
    for (const specifier of node.specifiers) {
      if (specifier.importKind === 'type') continue;
      const name = specifier.type === 'ImportNamespaceSpecifier' ? '*' : specifier.type === 'ImportDefaultSpecifier' ? 'default'
        : specifier.imported?.name ?? specifier.imported?.value;
      if (!THREE_MATH.has(name)) uses.add(`three:${name}`);
    }
  }
  walk(program, (node) => {
    if ((node.type === 'VariableDeclarator' || node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id?.type === 'Identifier') declared.add(node.id.name);
    if ((node.type === 'ImportSpecifier' || node.type === 'ImportDefaultSpecifier' || node.type === 'ImportNamespaceSpecifier') && node.local) declared.add(node.local.name);
  });
  walk(program, (node, parent, field) => {
    if (node.type !== 'Identifier' || !DOM_GLOBALS.has(node.name) || declared.has(node.name)) return;
    if (parent?.type === 'MemberExpression' && field === 'property' && !parent.computed) return;
    if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition' || parent?.type === 'PropertyDefinition') && field === 'key' && !parent.computed) return;
    if (parent?.type?.startsWith('TS')) return;
    if (parent?.type === 'FunctionDeclaration' || parent?.type === 'FunctionExpression' || parent?.type === 'ArrowFunctionExpression') {
      if (field === 'params') return;
    }
    uses.add(`dom:${node.name}`);
  });
  return [...uses].sort();
}

/**
 * (a) The core imports no driver code. Returns the violations: a forbidden module in the core's closure (with its
 * chain), and render-side reach (src/engine, src/ui, three.js beyond its math, browser globals) outside `pinned`, the
 * shrink-only list of what the core reached when the rule was written; a pinned module the core no longer reaches is
 * reported too, so the pin only ever shrinks.
 */
export function coreViolations({ root = process.cwd(), read = checkoutReader(root), extraEdges = {}, pinned = [], roots = coreRoots(root) } = {}) {
  const closure = runtimeClosure(roots, { root, read, extraEdges });
  const violations = [];
  const renderReach = new Map();
  for (const file of closure.keys()) {
    if (CORE_FORBIDDEN.some((pattern) => pattern.test(file))) { violations.push(`driver code in the core: ${closureChain(closure, file)}`); continue; }
    if (file.startsWith('src/game/') && !CORE_GAME_MODULES.includes(file)) { violations.push(`src/game outside the core's bots: ${closureChain(closure, file)}`); continue; }
    if (!SCRIPT_RE.test(file)) continue;
    const uses = /^src\/(?:engine|ui)\//.test(file) ? ['render-side module'] : renderSideUses(read(file), file);
    if (uses.length) renderReach.set(file, uses);
  }
  const pin = new Set(pinned);
  for (const [file, uses] of renderReach) {
    if (!pin.has(file)) violations.push(`render-side reach outside the pin (${uses.join(', ')}): ${closureChain(closure, file)}`);
  }
  for (const file of pin) if (!renderReach.has(file)) violations.push(`pinned render-side module no longer reached (unpin it): ${file}`);
  return { violations, closure, renderReach };
}

/**
 * (b) The local driver never reaches the online driver. Returns the violations: an online module in a local entry's
 * closure (with its chain), and in main.ts, an online name or import outside the online declarations or inside a local
 * entry.
 */
export function localDriverViolations({ root = process.cwd(), read = checkoutReader(root), extraEdges = {} } = {}) {
  const violations = [];
  const closure = runtimeClosure(LOCAL_DRIVER_ENTRIES, { root, read, extraEdges });
  for (const file of closure.keys()) {
    if (ONLINE_DRIVER.test(file)) violations.push(`the local driver reaches the online driver: ${closureChain(closure, file)}`);
  }
  violations.push(...mainDriverViolations({ root, read, extraEdges }));
  return { violations, closure };
}

/** The top-level declaration names of one main.ts statement (a variable list, a function, a class). */
function declaredNames(statement) {
  const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
  if (!node) return [];
  if (node.type === 'VariableDeclaration') {
    return node.declarations.flatMap((declarator) => {
      if (declarator.id.type === 'Identifier') return [declarator.id.name];
      const names = [];
      walk(declarator.id, (inner, parent, field) => { if (inner.type === 'Identifier' && field !== 'key') names.push(inner.name); });
      return names;
    });
  }
  if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) return [node.id.name];
  return [];
}

/** main.ts: the online driver's names and imports sit only in its online declarations; the local entries name none. */
export function mainDriverViolations({ root = process.cwd(), read = checkoutReader(root), extraEdges = {}, file = 'src/main.ts' } = {}) {
  const rootDir = resolve(root);
  const source = read(file);
  const program = parseAst(source, { lang: 'ts' }, file);
  const violations = [];
  // every module main.ts reaches, and those of them that reach the online client stack (one backward pass)
  const closure = runtimeClosure([file], { root, read, extraEdges, edgesOut: true });
  const reachesOnline = new Set([...closure.keys()].filter((reached) => ONLINE_CLIENT_STACK.test(reached)));
  const importers = new Map();
  for (const [from, edges] of closure.edgesByFile) for (const edge of edges) {
    if (!importers.has(edge.to)) importers.set(edge.to, []);
    importers.get(edge.to).push(from);
  }
  const queue = [...reachesOnline];
  while (queue.length) for (const from of importers.get(queue.shift()) ?? []) if (!reachesOnline.has(from)) { reachesOnline.add(from); queue.push(from); }
  /** A module main.ts names that is the online driver, or whose closure reaches its client stack. */
  const isOnline = (target) => ONLINE_DRIVER.test(target) || reachesOnline.has(target);
  const resolveFromMain = (specifier) => {
    const target = resolveSpecifier(resolve(rootDir, file), specifier);
    return target ? key(rootDir, target) : null;
  };
  const onlineBindings = new Set();
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type') continue;
    const target = resolveFromMain(node.source.value);
    if (!target || !isOnline(target)) continue;
    for (const specifier of node.specifiers) if (specifier.importKind !== 'type') onlineBindings.add(specifier.local.name);
  }
  const online = new Set(MAIN_ONLINE_DECLARATIONS);
  const lineOf = (offset) => source.slice(0, offset).split('\n').length;
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') continue;
    const names = declaredNames(statement);
    const inOnline = names.some((name) => online.has(name));
    const inLocal = names.some((name) => MAIN_LOCAL_ENTRIES.includes(name));
    walk(statement, (node, parent, field) => {
      let reason = null;
      if (node.type === 'ImportExpression' && isLiteralString(node.source)) {
        const target = resolveFromMain(node.source.value);
        if (target && isOnline(target)) reason = `import('${node.source.value}')`;
      } else if (node.type === 'Identifier' && (onlineBindings.has(node.name) || (inLocal && online.has(node.name)))) {
        if (parent?.type === 'MemberExpression' && field === 'property' && !parent.computed) return;
        if (parent?.type === 'Property' && field === 'key' && !parent.computed) return;
        if (parent?.type?.startsWith('TS')) return;
        reason = node.name;
      }
      if (!reason) return;
      const where = names.length ? names.join(', ') : `the statement at line ${lineOf(statement.start)}`;
      if (inLocal) violations.push(`main.ts: the local entry ${where} names the online driver (${reason}, line ${lineOf(node.start)})`);
      else if (!inOnline) violations.push(`main.ts: ${where} names the online driver (${reason}, line ${lineOf(node.start)}) outside the online declarations`);
    });
  }
  for (const name of MAIN_LOCAL_ENTRIES) {
    if (!program.body.some((statement) => declaredNames(statement).includes(name))) violations.push(`main.ts: the local entry ${name} is missing`);
  }
  return violations;
}
