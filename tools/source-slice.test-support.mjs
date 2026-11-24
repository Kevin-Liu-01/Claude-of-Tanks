// Source slices for selftests (inherited-reds-276, 2026-11-23). Many receipts read a module's source, cut out some of its
// functions or a stretch of a function body, and run that text in a sandbox with their own stubs (`new Function`). Each
// receipt listed by hand what the slice needs, so a slice broke whenever the sliced source gained a dependency
// (ReferenceError builtEnvironmentFor / withContacts / brickWalls / lookLedger on main c7d111fad4) and the next lane had
// to rediscover it.
//
// This helper closes the slice over what it needs, the way the module itself resolves names:
//   1. the fixture's own parameters and the slice's own declarations (the receipt's stubs win);
//   2. an inert local (a function or a literal) of a function or block that encloses a sliced stretch (props.ts's
//      withContacts inside its build); a local that runs code when declared, or the enclosing function's parameter, is
//      the fixture's to declare, since pulling it would run what the fixture never meant to (a texture, a random draw);
//   3. the module's imports, loaded from the real module (the same instance an `import` gets);
//   4. the module's top-level declarations (a function, const, let or class the slice calls);
//   5. the runtime's globals (a name the slice also reads as `typeof name` is an optional global: document in Node).
// Each name the slice reads that none of these declares fails before the slice runs, with an error that names it.
// Pulled declarations are closed over in turn, so a dependency's dependency comes too.
//
//   const props = sourceSlice(new URL('../world/props.ts', import.meta.url)); // or await loadSourceSlice(...)
//   const run = props.compile({ THREE, P, field }, `${props.section('  const roads', '  // heaped')}; return roads;`);
//
// The body is TypeScript or JavaScript (types are stripped). It runs as a function body: `return` hands the fixture
// its value. Pulled module declarations go first; pulled enclosing locals go where the body writes
// `${slice.LOCALS}` (default: also first), so a local can read the fixture's own variables declared before it.
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript-compiler-api';

const LOCALS_MARK = '/*source-slice:locals*/';
const BODY_OPEN = 'function __sourceSliceBody__() {\n', BODY_CLOSE = '\n}';
/** A function body's text without its types (a body may `return`, which a module's top level may not). */
function stripBody(body) {
  const stripped = stripTypeScriptTypes(`${BODY_OPEN}${body}${BODY_CLOSE}`); // strip mode keeps every offset
  return stripped.slice(BODY_OPEN.length, stripped.length - BODY_CLOSE.length);
}
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
/** Loaded import namespaces by resolved path, shared by every slice (each module loads once, as `import` would). */
const NAMESPACES = new Map();

/** The error a slice throws when it reads a name nothing declares; `names` lists each one. */
export class SourceSliceMissingError extends Error {
  constructor(file, missing) {
    const what = ({ local }) => (!local ? '' : local.parameter ? `, a parameter of an enclosing function at ${file}:${local.line}`
      : `, an enclosing local at ${file}:${local.line} that runs code when declared`);
    const reader = ({ readBy }) => (readBy?.length ? `read by pulled ${readBy.join(', ')}` : 'read by the fixture body');
    super(`source slice of ${file}: ${missing.map((entry) => `${entry.name} (${reader(entry)}${what(entry)})`).join('; ')} `
      + `${missing.length === 1 ? 'is' : 'are'} read by the slice but declared by none of: the fixture's parameters, the slice, `
      + `an enclosing local, ${file}'s imports or its top-level declarations, the runtime's globals. Pass `
      + `${missing.length === 1 ? 'it' : 'them'} to compile() or declare ${missing.length === 1 ? 'it' : 'them'} in the fixture body.`);
    this.name = 'SourceSliceMissingError';
    this.names = missing.map(({ name }) => name);
  }
}

const isFunctionLike = (node) => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
  || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);

function bindingNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingNames(element.name, out);
  return out;
}

/** The value names a statement declares in its own scope, each with the text that declares only it (where it can). */
function statementDeclarations(statement, file) {
  const out = [];
  const text = (node) => node.getText(file);
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
    if (ts.isFunctionDeclaration(statement) && !statement.body) return out; // an overload signature
    out.push({ name: statement.name.text, node: statement, text: text(statement).replace(/^export\s+(default\s+)?/, '') });
  } else if (ts.isVariableStatement(statement)) {
    if (statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)) return out;
    const flags = statement.declarationList.flags;
    const keyword = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var';
    for (const declaration of statement.declarationList.declarations) {
      for (const name of bindingNames(declaration.name)) {
        out.push({ name, node: declaration, text: `${keyword} ${text(declaration)};` });
      }
    }
  }
  return out;
}

/** Each value import of a module: local name -> { specifier, imported } (imported '*' a namespace, 'default' a default). */
function moduleImports(file) {
  const out = new Map();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause || statement.importClause.isTypeOnly) continue;
    const specifier = statement.moduleSpecifier.text, clause = statement.importClause;
    if (clause.name) out.set(clause.name.text, { specifier, imported: 'default' });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) out.set(bindings.name.text, { specifier, imported: '*' });
    else if (bindings) for (const element of bindings.elements) {
      if (element.isTypeOnly) continue;
      out.set(element.name.text, { specifier, imported: (element.propertyName ?? element.name).text });
    }
  }
  return out;
}

/**
 * Whether declaring a local runs nothing: a function, or a const/let whose value is a function or a literal. Only these
 * enclosing locals are pulled; any other runs code when declared (a texture build, a draw from the build's random
 * stream), so pulling it would change what the fixture runs. The fixture declares those itself, or the slice fails
 * naming them.
 */
function isInert(node) {
  if (ts.isFunctionDeclaration(node)) return true;
  if (!ts.isVariableDeclaration(node)) return false;
  let init = node.initializer;
  while (init && (ts.isParenthesizedExpression(init) || ts.isAsExpression(init) || ts.isSatisfiesExpression(init))) init = init.expression;
  if (!init) return true;
  return ts.isArrowFunction(init) || ts.isFunctionExpression(init) || ts.isLiteralExpression(init)
    || ts.isNoSubstitutionTemplateLiteral(init) || init.kind === ts.SyntaxKind.TrueKeyword
    || init.kind === ts.SyntaxKind.FalseKeyword || init.kind === ts.SyntaxKind.NullKeyword;
}

/** Whether an identifier is read as a value (not a property name, label, or member key). */
function isValueReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isMethodDeclaration(parent) || ts.isPropertyDeclaration(parent)
    || ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if ((ts.isLabeledStatement(parent) || ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node) return false;
  if (ts.isMetaProperty(parent)) return false;
  return true;
}

/** Names `js` (a function body) reads without declaring, with the body line of their first read. */
function freeNames(js, declared) {
  const header = `function __sourceSlice__(${declared.join(', ')}) {\n`;
  const fileName = '/__source_slice__.js';
  const file = ts.createSourceFile(fileName, `${header}${js}\n}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const host = {
    getSourceFile: (name) => (name === fileName ? file : undefined), getDefaultLibFileName: () => 'lib.d.ts',
    writeFile() {}, getCurrentDirectory: () => '/', getCanonicalFileName: (name) => name, useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n', fileExists: (name) => name === fileName, readFile: () => undefined,
  };
  const program = ts.createProgram([fileName], { allowJs: true, noLib: true, noResolve: true, types: [] }, host);
  const parseErrors = program.getSyntacticDiagnostics(file);
  if (parseErrors.length) {
    const first = parseErrors[0], { line } = file.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new SyntaxError(`source slice does not parse at slice line ${line}: ${ts.flattenDiagnosticMessageText(first.messageText, '\n')}`);
  }
  const checker = program.getTypeChecker(), free = new Map(), probed = new Set();
  const visit = (node) => {
    // `typeof name` is how the source reads a global it can run without (document, location in Node): such a name is
    // optional, not missing
    if (ts.isTypeOfExpression(node) && ts.isIdentifier(node.expression)) probed.add(node.expression.text);
    if (ts.isIdentifier(node)) {
      let symbol;
      if (ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node) symbol = checker.getShorthandAssignmentValueSymbol(node.parent);
      else if (isValueReference(node)) symbol = checker.getSymbolAtLocation(node);
      else return;
      if (!symbol && !free.has(node.text)) free.set(node.text, file.getLineAndCharacterOfPosition(node.getStart(file)).line);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const name of probed) free.delete(name);
  return free;
}

/**
 * A module's source, for slicing. `url` is the module's file URL (its imports resolve from there); `text` replaces its
 * text (a mutant, or terrainSourceText's interpolated terrain.ts).
 */
export function sourceSlice(url, { text } = {}) {
  const path = fileURLToPath(url);
  const label = relative(REPO_ROOT, path);
  const source = text ?? readFileSync(url, 'utf8');
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = moduleImports(file);
  const topLevel = new Map();
  for (const statement of file.statements) {
    for (const entry of statementDeclarations(statement, file)) if (!topLevel.has(entry.name)) topLevel.set(entry.name, entry);
  }
  const ranges = [];
  const addRange = (start, end) => { if (!ranges.some(([a, b]) => a === start && b === end)) ranges.push([start, end]); };
  const require = createRequire(url);
  const load = (name) => {
    const { specifier, imported } = imports.get(name);
    const key = require.resolve(specifier);
    let namespace = NAMESPACES.get(key);
    if (namespace instanceof Error) {
      throw new Error(`source slice of ${label}: its import of ${name} from '${specifier}' does not load in Node (${namespace.message}); pass ${name} to compile()`, { cause: namespace });
    }
    if (!namespace) {
      try { namespace = require(specifier); }
      catch (error) {
        const hint = error.code === 'ERR_REQUIRE_ASYNC_MODULE' ? ` (its graph awaits at top level: make the slice with \`await loadSourceSlice(url)\`, which imports first)` : '';
        throw new Error(`source slice of ${label}: its import of ${name} from '${specifier}' does not load in Node${hint}: ${error.message}`, { cause: error });
      }
      NAMESPACES.set(key, namespace);
    }
    if (imported === '*') return namespace;
    if (!(imported in namespace)) throw new Error(`source slice of ${label}: '${specifier}' exports no ${imported}`);
    return namespace[imported];
  };

  /** The locals of each function or block that encloses a sliced stretch, outside the stretch, by name. */
  function enclosingLocals() {
    const out = new Map();
    for (const [start, end] of ranges) {
      const walk = (node) => {
        if (node.getStart(file) > start || node.end < end) return;
        const scopes = ts.isBlock(node) || ts.isSourceFile(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)
          ? node.statements : null;
        if (scopes && !ts.isSourceFile(node)) {
          for (const statement of scopes) {
            if (statement.end > start && statement.getStart(file) < end) continue; // inside the stretch: the slice has it
            for (const entry of statementDeclarations(statement, file)) {
              const known = out.get(entry.name);
              const line = file.getLineAndCharacterOfPosition(entry.node.getStart(file)).line + 1;
              if (!known || known.depth < depth) out.set(entry.name, { ...entry, depth, line, inert: isInert(entry.node) });
            }
          }
        }
        if (isFunctionLike(node)) {
          for (const parameter of node.parameters) for (const name of bindingNames(parameter.name)) {
            const known = out.get(name);
            const line = file.getLineAndCharacterOfPosition(parameter.getStart(file)).line + 1;
            if (!known || known.depth < depth) out.set(name, { name, parameter: true, depth, line });
          }
        }
        depth++;
        ts.forEachChild(node, walk);
        depth--;
      };
      let depth = 0;
      walk(file);
    }
    return out;
  }

  const slice = {
    url, path, label, source, file,
    /** Import each module this one imports a value from (once per process), so compile() can bind modules whose graph
     * awaits at top level, which a synchronous require cannot load. A module that fails is reported only if read. */
    async preload() {
      for (const { specifier } of new Set(imports.values())) {
        const key = require.resolve(specifier);
        if (NAMESPACES.has(key)) continue;
        try { NAMESPACES.set(key, await import(pathToFileURL(key).href)); }
        catch (error) { NAMESPACES.set(key, error); }
      }
      return slice;
    },
    /** Where pulled enclosing locals go in a compile() body (default: its top). */
    LOCALS: LOCALS_MARK,
    /** A top-level function's (or class's, or const's) declaration text, without `export`. */
    declaration(name) {
      const entry = topLevel.get(name);
      if (!entry) throw new Error(`source slice of ${label}: no top-level declaration ${name}`);
      const matches = file.statements.filter((statement) => statementDeclarations(statement, file).some((d) => d.name === name));
      if (matches.length !== 1) throw new Error(`source slice of ${label}: ${matches.length} top-level declarations of ${name}`);
      addRange(entry.node.getStart(file), entry.node.end);
      return entry.text;
    },
    /** The text from `start` (included) to the next `end` (excluded); each must occur. */
    section(start, end) {
      const a = source.indexOf(start), b = a < 0 ? -1 : source.indexOf(end, a + start.length);
      if (a < 0) throw new Error(`source slice of ${label}: section start not found: ${JSON.stringify(start.slice(0, 80))}`);
      if (b < 0) throw new Error(`source slice of ${label}: section end not found after its start: ${JSON.stringify(end.slice(0, 80))}`);
      addRange(a, b);
      return source.slice(a, b);
    },
    /**
     * The names `body` would read that the fixture's `params` do not give, each with how the module resolves it.
     * Returns { prelude, locals, bindings, missing }: the declarations to put first and at LOCALS, the import bindings
     * to pass, and the names nothing declares.
     */
    resolve(params, body) {
      const js = stripBody(body);
      const given = Object.keys(params);
      const locals = enclosingLocals();
      const prelude = new Map(), pulledLocals = new Map(), bindings = new Map(), globals = new Set();
      const missing = new Map(); // every name nothing declares, found in one pass (the closure goes on past each)
      for (;;) {
        const composed = compose(js, prelude, pulledLocals);
        const free = freeNames(composed, [...given, ...bindings.keys()]);
        for (const name of [...globals, ...missing.keys()]) free.delete(name);
        let progressed = false;
        for (const [name, line] of free) {
          const local = locals.get(name);
          if (local && local.inert && !pulledLocals.has(name)) { pulledLocals.set(name, local); progressed = true; }
          else if (!local && imports.has(name)) { bindings.set(name, load(name)); progressed = true; }
          else if (!local && topLevel.has(name) && !prelude.has(name)) { prelude.set(name, topLevel.get(name)); progressed = true; }
          else if (!local && name in globalThis) { globals.add(name); progressed = true; }
          else missing.set(name, { name, line: line - 1, local });
        }
        if (progressed) continue;
        // who reads each missing name: a declaration the closure pulled, or the fixture's own body
        const pulled = [...prelude.values(), ...pulledLocals.values()];
        for (const entry of missing.values()) {
          entry.readBy = pulled.filter((p) => freeNames(stripBody(p.text), []).has(entry.name)).map((p) => p.name);
        }
        return { prelude, locals: pulledLocals, bindings, missing: [...missing.values()] };
      }
    },
    /** Run `body` (a function body over the slices) with `params` and everything else it reads closed over. */
    compile(params, body) {
      const { prelude, locals, bindings, missing } = slice.resolve(params, body);
      if (missing.length) throw new SourceSliceMissingError(label, missing);
      const js = compose(stripBody(body), prelude, locals);
      const names = [...Object.keys(params), ...bindings.keys()];
      const values = [...Object.values(params), ...bindings.values()];
      return new Function(...names, js)(...values);
    },
  };
  return slice;
}

/** sourceSlice with every import loaded first (needed when an import's graph awaits at top level). */
export async function loadSourceSlice(url, options) {
  return sourceSlice(url, options).preload();
}

function compose(js, prelude, locals) {
  const ordered = (entries) => [...entries.values()].sort((a, b) => a.node.pos - b.node.pos).map((entry) => stripBody(entry.text)).join('\n');
  const top = prelude.size ? `${ordered(prelude)}\n` : '';
  const pulled = locals.size ? `\n${ordered(locals)}\n` : '';
  if (js.includes(LOCALS_MARK)) return top + js.replace(LOCALS_MARK, pulled);
  return top + pulled + js;
}
