import ts from 'typescript-compiler-api';

// Read syntax, not comments or source snippets in assertions. A mention of
// Puppeteer in input.ts used to invalidate hundreds of checks on any doc edit.
const FILE_LITERAL = /^(?:\.{1,2}\/|\/?(?:src|tools|docs|public|server|scripts|shots|tests|cloudflare|node_modules)\/)|^[\w.-]+\.(?:html|json|css|md|txt|webp|png|svg|xml|ts|mjs|js)$/;
const URL_PATH = /\/(?:src|tools|public|docs)\/[\w./-]+\.[\w]+/g;
const BROAD_CALLS = new Set(['execFileSync', 'execSync', 'spawnSync', 'readdirSync', 'readdir', 'glob', 'globSync', 'createServer']);
const nameOf = node => ts.isIdentifier(node) ? node.text
  : ts.isPropertyAccessExpression(node) ? node.name.text : '';
const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null;
const isEnvironment = value => ts.isPropertyAccessExpression(value)
  && ts.isIdentifier(value.expression) && value.expression.text === 'process' && value.name.text === 'env';

export function collectSelftestInputs(text, filename) {
  const specifiers = new Set(), imports = new Set(), environment = new Set(), joined = [], dynamic = [];
  let broad = false, browser = false, git = false, opaqueImport = false, opaqueEnvironment = false;
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
      joined.push(...child.joined); dynamic.push(...child.dynamic);
      broad ||= child.broad; browser ||= child.browser; git ||= child.git;
      opaqueImport ||= child.opaqueImport; opaqueEnvironment ||= child.opaqueEnvironment;
    }
  } else {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true,
      filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imported = value => {
      if (value == null) return;
      specifiers.add(value);
      imports.add(value);
      if (value === 'node:child_process' || value === 'child_process') broad = true;
      if (/^(?:puppeteer|playwright)(?:-core)?(?:\/|$)/.test(value)) { broad = true; browser = true; }
    };
    const isTypeOnly = node => {
      if (ts.isExportDeclaration(node)) return node.isTypeOnly;
      if (!ts.isImportDeclaration(node)) return false;
      const clause = node.importClause, bindings = clause?.namedBindings;
      return clause?.isTypeOnly || (!clause?.name && bindings && ts.isNamedImports(bindings)
        && bindings.elements.length && bindings.elements.every(item => item.isTypeOnly));
    };
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
      if (['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec'].includes(name)
        && /^git(?:\s|$)/.test(literal(node.arguments[0]) ?? '')) git = true;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) readImportCall(node.arguments[0]);
      if (name === 'join' || name === 'resolve') {
        const segments = node.arguments.map(literal).filter(value => value !== null);
        if (segments.length) joined.push(segments);
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
      if (ts.isStringLiteralLike(node)) addLiteral(node.text);
      if (ts.isTemplateExpression(node)) readTemplate(node);
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (source.parseDiagnostics.length) broad = true;
  }
  return { specifiers: [...specifiers], imports: [...imports], environment: [...environment],
    joined, dynamic, broad, browser, git, opaqueImport, opaqueEnvironment };
}
