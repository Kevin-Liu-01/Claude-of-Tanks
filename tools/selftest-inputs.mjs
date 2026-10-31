import ts from 'typescript-compiler-api';

// Read syntax, not comments or source snippets in assertions. A mention of
// Puppeteer in input.ts used to invalidate hundreds of checks on any doc edit.
// The checkout's top-level directories a path literal can start with: every tracked one (selftest-cache.selftest holds
// the list to `git ls-tree`; 266: site/, api/ and crates/ came after it, so 'site/home.html' named no input; release/
// came with integ/265's fingerprints) and the untracked roots receipts read (shots/, tests/, node_modules/).
export const SELFTEST_ROOT_DIRS = Object.freeze(['src', 'tools', 'docs', 'public', 'server', 'scripts', 'site', 'api', 'crates',
  'cloudflare', 'LICENSES', 'release', '.github', '.agents', '.agent-docs', '.cargo', 'shots', 'tests', 'node_modules']);
const FILE_LITERAL = new RegExp(`^(?:\\.{1,2}/|/?(?:${SELFTEST_ROOT_DIRS.map(name => name.replace(/\./g, '\\.')).join('|')})/)`
  + '|^[\\w.-]+\\.(?:html|json|css|md|txt|webp|png|svg|xml|ts|mjs|js)$');
const URL_PATH = /\/(?:src|tools|public|docs)\/[\w./-]+\.[\w]+/g;
const BROAD_CALLS = new Set(['execFileSync', 'execSync', 'spawnSync', 'readdirSync', 'readdir', 'opendirSync', 'opendir',
  'glob', 'globSync', 'createServer']);
// A listing names the files a module reads by walking a tree, not by path (2026-10-20, 228p: runtimeStyles' readdir over
// src). tools/selftest-scans.mjs declares what each listing module lists; selftest-scans.selftest fails on a new one.
const LISTING_CALLS = new Set(['readdirSync', 'readdir', 'opendirSync', 'opendir', 'glob', 'globSync']);
const GIT_LISTING_ARGS = new Set(['ls-files', 'ls-tree', 'grep', '--name-only', '--name-status', '--porcelain']);
const EXEC_CALLS = new Set(['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec', 'fork']);
const nameOf = node => ts.isIdentifier(node) ? node.text
  : ts.isPropertyAccessExpression(node) ? node.name.text : '';
const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null;
const isEnvironment = value => ts.isPropertyAccessExpression(value)
  && ts.isIdentifier(value.expression) && value.expression.text === 'process' && value.name.text === 'env';

export function collectSelftestInputs(text, filename) {
  const specifiers = new Set(), imports = new Set(), environment = new Set(), joined = [], dynamic = [], scans = [];
  let broad = false, browser = false, git = false, opaqueImport = false, opaqueEnvironment = false, spawns = false;
  const addLiteral = value => {
    if (FILE_LITERAL.test(value)) specifiers.add(value);
    for (const match of value.matchAll(URL_PATH)) specifiers.add(match[0]);
  };
  if (filename.endsWith('.json')) {
    const visit = value => {
      if (typeof value === 'string') addLiteral(value);
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) { addLiteral(key); visit(child); }
      }
    };
    try { visit(JSON.parse(text)); } catch { broad = true; }
  } else if (filename.endsWith('.html')) {
    for (const match of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) specifiers.add(match[1]);
    for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
      const child = collectSelftestInputs(match[1], filename + '.js');
      child.specifiers.forEach(value => specifiers.add(value));
      child.imports.forEach(value => imports.add(value));
      child.environment.forEach(value => environment.add(value));
      joined.push(...child.joined); dynamic.push(...child.dynamic); scans.push(...child.scans);
      broad ||= child.broad; browser ||= child.browser; git ||= child.git; spawns ||= child.spawns;
      opaqueImport ||= child.opaqueImport; opaqueEnvironment ||= child.opaqueEnvironment;
    }
  } else {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lineOf = node => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const gitListings = [];
    const imported = value => {
      if (value == null) return;
      specifiers.add(value);
      imports.add(value);
      if (value === 'node:child_process' || value === 'child_process') { broad = true; spawns = true; }
      if (value === 'node:worker_threads' || value === 'worker_threads') spawns = true;
      if (/^(?:puppeteer|playwright)(?:-core)?(?:\/|$)/.test(value)) { broad = true; browser = true; }
    };
    const isTypeOnly = node => {
      if (ts.isExportDeclaration(node)) return node.isTypeOnly;
      if (!ts.isImportDeclaration(node)) return false;
      const clause = node.importClause, bindings = clause?.namedBindings;
      return clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length && bindings.elements.every(item => item.isTypeOnly));
    };
    // `join`/`resolve` name files only as node:path functions (2026-10-16, the 226 audit): `parts.join('')` in
    // materials.ts read as "the directory src/vehicles" and put the whole vehicle tree into ~600 receipts' keys, and a
    // Promise's `resolve('x')` read as a file. A path call counts when its callee is bound by an import from node:path
    // (a named join/resolve, or a member of its default, namespace, posix or win32 binding), and only literal segments
    // that carry a letter or digit can name a file ('', '/' and '..' alone name none).
    const pathModules = new Set(), pathFunctions = new Set();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !/^(?:node:)?path(?:\/(?:posix|win32))?$/.test(literal(statement.moduleSpecifier) ?? '')) continue;
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) pathModules.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) pathModules.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        const imported = (element.propertyName ?? element.name).text;
        if (imported === 'join' || imported === 'resolve') pathFunctions.add(element.name.text);
        if (imported === 'posix' || imported === 'win32' || imported === 'default') pathModules.add(element.name.text);
      }
    }
    const pathModule = node => ts.isIdentifier(node) ? pathModules.has(node.text)
      : ts.isPropertyAccessExpression(node) && ['posix', 'win32'].includes(node.name.text) && pathModule(node.expression);
    const isPathCall = callee => ts.isIdentifier(callee) ? pathFunctions.has(callee.text)
      : ts.isPropertyAccessExpression(callee) && ['join', 'resolve'].includes(callee.name.text) && pathModule(callee.expression);
    const readImportCall = arg => {
      const value = literal(arg);
      if (value != null) imported(value);
      else if (arg && ts.isTemplateExpression(arg)) {
        dynamic.push({ prefix: arg.head.text, suffix: arg.templateSpans.at(-1).literal.text, execute: true });
      } else { broad = true; opaqueImport = true; }
    };
    const readCall = node => {
      const name = nameOf(node.expression);
      if (BROAD_CALLS.has(name)) broad = true;
      if (LISTING_CALLS.has(name)) scans.push({ call: name, line: lineOf(node) });
      if (EXEC_CALLS.has(name) && /^git(?:\s|$)/.test(literal(node.arguments[0]) ?? '')) git = true;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) readImportCall(node.arguments[0]);
      if (isPathCall(node.expression)) {
        const segments = node.arguments.map(literal).filter(value => value !== null);
        if (segments.some(value => /[A-Za-z0-9]/.test(value))) joined.push(segments);
      }
    };
    const readEnvironmentBinding = pattern => {
      for (const element of pattern.elements) {
        const key = element.propertyName ?? element.name;
        if (element.dotDotDotToken || !(ts.isIdentifier(key) || ts.isStringLiteralLike(key))) opaqueEnvironment = true;
        else environment.add(key.text);
      }
    };
    const readEnvironment = node => {
      if (ts.isPropertyAccessExpression(node) && isEnvironment(node.expression)) environment.add(node.name.text);
      if (ts.isElementAccessExpression(node) && isEnvironment(node.expression)) {
        const name = literal(node.argumentExpression);
        if (name == null) opaqueEnvironment = true;
        else environment.add(name);
      }
      if (!isEnvironment(node)) return;
      const parent = node.parent;
      if (ts.isVariableDeclaration(parent) && ts.isObjectBindingPattern(parent.name)) {
        readEnvironmentBinding(parent.name);
      } else if (!((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node)) {
        opaqueEnvironment = true; // passing/spreading the whole environment cannot be scoped safely
      }
    };
    const readTemplate = node => {
      // A URL whose port is interpolated still names a concrete fixture page.
      if (FILE_LITERAL.test(node.head.text)) dynamic.push({ prefix: node.head.text,
        suffix: node.templateSpans.at(-1).literal.text, execute: false });
      for (const span of node.templateSpans) addLiteral(span.literal.text);
    };
    const visit = node => {
      if (isTypeOnly(node)) return;
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) imported(literal(node.moduleSpecifier));
      if (ts.isCallExpression(node)) readCall(node);
      readEnvironment(node);
      if (ts.isStringLiteralLike(node)) {
        addLiteral(node.text);
        if (GIT_LISTING_ARGS.has(node.text)) gitListings.push({ call: `git ${node.text}`, line: lineOf(node) });
      }
      if (ts.isTemplateExpression(node)) readTemplate(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (source.parseDiagnostics.length) broad = true;
    // git's listings (ls-files, grep, a name-only diff) count where the module runs git at all
    if (git) scans.push(...gitListings);
  }
  return { specifiers: [...specifiers], imports: [...imports], environment: [...environment],
    joined, dynamic, broad, browser, git, opaqueImport, opaqueEnvironment, spawns, scans };
}
