import ts from 'typescript-compiler-api';

// Read syntax, not comments or source snippets in assertions. A mention of
// Puppeteer in input.ts used to invalidate hundreds of checks on any doc edit.
// A literal is a path candidate by shape alone: `./x`, `../x`, `<dir>/…`, `/<dir>/…` or a bare `name.ext`. The parser
// knows no directory names. tools/selftest-cache.mjs resolves each candidate against the checkout's own top-level
// directories and the naming module's directory, so a new root (site/ was missed until 2026-10-13) needs no edit here.
const FILE_LITERAL = /^(?:\.{1,2}\/|\/?[\w.-]+\/)|^[\w.-]+\.(?:html|json|jsonc|webmanifest|css|md|txt|csv|tsv|yml|yaml|xml|svg|webp|png|jpe?g|gif|avif|ico|webm|mp4|wv|ogg|mp3|wav|woff2?|glb|gltf|bin|ts|mts|cts|tsx|mjs|cjs|jsx|js|zsh|sh|py)$/;
// `/<dir>/<…>.<ext>` inside a longer string (a dev-server URL, a GitHub docs link): every slash may start one.
const URL_PATH = /\/[\w.-]+\/[\w./-]*\.\w+/y;
const URL_SCHEME = /^[a-z][a-z\d+.-]*:/i;
const BROAD_CALLS = new Set(['execFileSync', 'execSync', 'spawnSync', 'readdirSync', 'readdir', 'glob', 'globSync', 'createServer']);
// `import(/* @selftest-external: <what it loads> */ url)` names a module outside the repository (a built page chunk).
// It is not an input, so it neither widens the closure nor forces a fresh run; unmarked computed imports still do.
const EXTERNAL_IMPORT = /@selftest-external\b:?\s*/;
// A comment `@selftest-reads: <path> — <why>` declares a path a module reads through computed names the parser cannot
// follow (a source walker that reads each module its entry imports). It only ever adds an input.
const READS_MARKER = /@selftest-reads:\s*([\w./-]+)/g;
const PATH_MODULE = /^(?:node:)?path(?:\/posix)?$/;
const nameOf = node => ts.isIdentifier(node) ? node.text
  : ts.isPropertyAccessExpression(node) ? node.name.text : '';
const literal = node => node && ts.isStringLiteralLike(node) ? node.text : null;
const isEnvironment = value => ts.isPropertyAccessExpression(value)
  && ts.isIdentifier(value.expression) && value.expression.text === 'process' && value.name.text === 'env';

export function collectSelftestInputs(text, filename) {
  const specifiers = new Set(), imports = new Set(), environment = new Set(), joined = [], dynamic = [], external = [];
  const reads = new Set();
  let broad = false, browser = false, git = false, opaqueImport = false, opaqueEnvironment = false;
  const addLiteral = value => {
    if (FILE_LITERAL.test(value)) specifiers.add(value);
    for (let at = value.indexOf('/'); at >= 0; at = value.indexOf('/', at + 1)) {
      URL_PATH.lastIndex = at;
      const match = URL_PATH.exec(value);
      if (match) specifiers.add(match[0]);
    }
  };
  // A JSON key or value is a path only as a whole string: catalog prose that links a GitHub docs URL is not an input.
  const addJsonLiteral = value => {
    if (!/\s/.test(value) && !URL_SCHEME.test(value) && FILE_LITERAL.test(value)) specifiers.add(value);
  };
  if (filename.endsWith('.json')) {
    const visit = value => {
      if (typeof value === 'string') addJsonLiteral(value);
      else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) { addJsonLiteral(key); visit(child); }
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
      joined.push(...child.joined); dynamic.push(...child.dynamic); external.push(...child.external);
      child.reads.forEach(value => reads.add(value));
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
    // The argument's own comments: TypeScript files those on the `import(` line as trailing ranges, later lines' as leading.
    const externalReason = arg => {
      for (const range of [...ts.getTrailingCommentRanges(text, arg.pos) ?? [], ...ts.getLeadingCommentRanges(text, arg.pos) ?? []]) {
        const comment = text.slice(range.pos, range.end);
        const marker = EXTERNAL_IMPORT.exec(comment);
        if (marker) return comment.slice(marker.index + marker[0].length).replace(/\s*\*\/$/, '').trim();
      }
      return null;
    };
    const readImportCall = arg => {
      const value = literal(arg);
      if (value != null) imported(value);
      else if (arg && ts.isTemplateExpression(arg)) {
        dynamic.push({ prefix: arg.head.text, suffix: arg.templateSpans.at(-1).literal.text, execute: true });
      } else {
        const reason = arg ? externalReason(arg) : null;
        if (reason != null) external.push(reason);
        else { broad = true; opaqueImport = true; }
      }
    };
    // Only node:path's join/resolve name repository paths; Array#join('') and Promise.resolve(x) do not.
    const pathFunctions = new Set(), pathNamespaces = new Set(['path', 'posix']);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !PATH_MODULE.test(literal(statement.moduleSpecifier) ?? '')) continue;
      const clause = statement.importClause, bindings = clause?.namedBindings;
      if (clause?.name) pathNamespaces.add(clause.name.text);
      if (bindings && ts.isNamespaceImport(bindings)) pathNamespaces.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
        const original = (element.propertyName ?? element.name).text;
        if (original === 'join' || original === 'resolve') pathFunctions.add(element.name.text);
        if (original === 'posix') pathNamespaces.add(element.name.text);
      }
    }
    const isPathCall = callee => {
      if (ts.isIdentifier(callee)) return pathFunctions.has(callee.text);
      if (!ts.isPropertyAccessExpression(callee) || !['join', 'resolve'].includes(callee.name.text)) return false;
      const owner = callee.expression;
      return (ts.isIdentifier(owner) && pathNamespaces.has(owner.text))
        || (ts.isPropertyAccessExpression(owner) && owner.name.text === 'posix');
    };
    const readCall = node => {
      const name = nameOf(node.expression);
      if (BROAD_CALLS.has(name)) broad = true;
      if (['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec'].includes(name)
        && /^git(?:\s|$)/.test(literal(node.arguments[0]) ?? '')) git = true;
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) readImportCall(node.arguments[0]);
      if (isPathCall(node.expression)) {
        const segments = node.arguments.map(literal).filter(value => value !== null);
        if (segments.some(value => value !== '')) joined.push(segments);
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
      const suffix = node.templateSpans.at(-1).literal.text;
      if (FILE_LITERAL.test(node.head.text)) dynamic.push({ prefix: node.head.text, suffix, execute: false });
      node.templateSpans.forEach((span, index) => {
        const text = span.literal.text;
        addLiteral(text);
        // `${ROOT}/site/docs-${id}.html`: a path segment between interpolations names a directory under an unknown base
        // (the checkout root, the module's directory). Recorded as `based`, it never widens to the tree when unresolved.
        if (index < node.templateSpans.length - 1 && /^\/?[\w.-]+\//.test(text)) {
          dynamic.push({ prefix: text.replace(/^\//, ''), suffix, execute: false, based: true });
        } else if (text.startsWith('/') && FILE_LITERAL.test(text.slice(1))) addLiteral(text.slice(1));
      });
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
    if (text.includes('@selftest-reads')) {
      // Comments only: a fixture string that mentions the marker declares nothing.
      const seen = new Set();
      const readComments = node => {
        for (const range of [...ts.getLeadingCommentRanges(text, node.pos) ?? [], ...ts.getTrailingCommentRanges(text, node.end) ?? []]) {
          if (seen.has(range.pos)) continue;
          seen.add(range.pos);
          for (const match of text.slice(range.pos, range.end).matchAll(READS_MARKER)) reads.add(match[1]);
        }
        ts.forEachChild(node, readComments);
      };
      readComments(source);
    }
  }
  return { specifiers: [...specifiers], imports: [...imports], environment: [...environment],
    joined, dynamic, external, reads: [...reads], broad, browser, git, opaqueImport, opaqueEnvironment };
}
